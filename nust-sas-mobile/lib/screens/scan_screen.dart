import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';
import 'package:google_mlkit_barcode_scanning/google_mlkit_barcode_scanning.dart';
import 'package:geolocator/geolocator.dart';
import '../services/sensor_service.dart';
import '../services/api_service.dart';
import '../services/challenge_service.dart';
import '../widgets/challenge_animations.dart';
import 'dart:io';

enum VerificationStep { 
  scanningQR, 
  checkingLocation, 
  checkingDevice, 
  verifyingFace, 
  submitting, 
  success, 
  failure 
}

class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key});

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> with SingleTickerProviderStateMixin {
  CameraController? _controller;
  bool _isBusy = false;
  String? _statusMessage;
  String? _errorDetails;
  VerificationStep _currentStep = VerificationStep.scanningQR;
  
  late BarcodeScanner _barcodeScanner;
  FaceDetector? _faceDetector; // Lazy loaded
  
  String? _scannedQrToken;
  Map<String, dynamic>? _locationData;
  Map<String, dynamic>? _deviceInfo;
  
  bool _blinkDetected = false;
  bool _headRotationDetected = false;
  int _faceCheckCount = 0;
  
  // Challenge system for anti-prerecording
  Challenge? _currentChallenge;
  String? _challengeSeed;
  DateTime? _challengeStartTime;
  bool _challengeCompleted = false;
  int _challengeProgress = 0;  // For multi-step challenges or counts
  
  // State for tracking actions
  bool _isEyeClosed = false;
  int _blinkCount = 0;
  bool _isSmileDetected = false;
  
  // Track basic presence
  double? _lastHeadAngleY;
  
  // Pre-cached data for faster verification
  Map<String, dynamic>? _cachedLocationData;
  Map<String, dynamic>? _cachedDeviceInfo;
  bool _dataPreloaded = false;
  
  final SensorService _sensorService = SensorService();
  final ApiService _apiService = ApiService();
  
  late AnimationController _animationController;
  late Animation<double> _scaleAnimation;

  @override
  void initState() {
    super.initState();
    _initializeDetectors();
    _initializeCamera(CameraLensDirection.back);
    _preloadData(); // Pre-fetch location & device in background
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 600),
      vsync: this,
    );
    _scaleAnimation = Tween<double>(begin: 0.8, end: 1.0).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.elasticOut),
    );
  }

  /// Pre-fetch location and device info in background to speed up verification
  Future<void> _preloadData() async {
    try {
      // Fetch both in parallel
      final results = await Future.wait([
        _sensorService.getCurrentPosition(),
        _sensorService.getDeviceInfo(),
      ]);
      
      final position = results[0] as Position;
      final deviceInfo = results[1] as Map<String, dynamic>;
      
      if (mounted) {
        _cachedLocationData = {
          "lat": position.latitude,
          "lon": position.longitude,
          "accuracy": position.accuracy,
          "is_mock": position.isMocked
        };
        _cachedDeviceInfo = {
          "id": deviceInfo['id'],
          "model": deviceInfo['model'],
          "platform": Platform.isAndroid ? "android" : "ios",
        };
        _dataPreloaded = true;
        debugPrint('Data preloaded: location and device ready');
      }
    } catch (e) {
      debugPrint('Preload failed (will fetch on demand): $e');
    }
  }

  void _initializeDetectors() {
    _barcodeScanner = BarcodeScanner();
    // FaceDetector initialized lazily
  }

  Future<void> _initFaceDetector() async {
    if (_faceDetector != null) return;
    
    final options = FaceDetectorOptions(
      enableClassification: true,
      enableLandmarks: true,
      performanceMode: FaceDetectorMode.accurate,
    );
    _faceDetector = FaceDetector(options: options);
  }

  Future<void> _initializeCamera(CameraLensDirection direction) async {
    final cameras = await availableCameras();
    final camera = cameras.firstWhere(
      (camera) => camera.lensDirection == direction,
      orElse: () => cameras.first,
    );

    _controller = CameraController(
      camera,
      ResolutionPreset.medium, // Efficiency: Medium is sufficient for QR & ML Kit
      enableAudio: false,
      imageFormatGroup: Platform.isAndroid
          ? ImageFormatGroup.nv21
          : ImageFormatGroup.bgra8888,
    );

    await _controller!.initialize();
    if (!mounted) return;

    _controller!.startImageStream(_processImage);
    setState(() {});
  }

  Future<void> _switchCamera(CameraLensDirection direction) async {
    if (_controller != null) {
      if (_controller!.value.isStreamingImages) {
        await _controller!.stopImageStream();
      }
      await _controller!.dispose();
      _controller = null;
    }
    await _initializeCamera(direction);
  }

  Future<void> _processImage(CameraImage image) async {
    if (_isBusy) return;
    _isBusy = true;

    try {
      final inputImage = _inputImageFromCameraImage(image);
      if (inputImage == null) return;

      if (_currentStep == VerificationStep.scanningQR) {
        final barcodes = await _barcodeScanner.processImage(inputImage);
        if (barcodes.isNotEmpty) {
          await _handleQrCode(barcodes.first);
        }
      } else if (_currentStep == VerificationStep.verifyingFace && _faceDetector != null) {
        final faces = await _faceDetector!.processImage(inputImage);
        _checkLiveness(faces);
      }
    } catch (e) {
      debugPrint('Error processing image: $e');
    } finally {
      _isBusy = false;
    }
  }

  Future<void> _handleQrCode(Barcode barcode) async {
    final qrCode = barcode.rawValue;
    if (qrCode == null) return;

    await _controller?.stopImageStream();
    
    // Extract challenge seed from QR token
    _challengeSeed = extractChallengeSeed(qrCode);
    if (_challengeSeed != null) {
      _currentChallenge = deriveChallenge(_challengeSeed!);
      debugPrint('Challenge derived: ${_currentChallenge?.type.value} param=${_currentChallenge?.param}');
    }

    // Lazy load face detector now
    _initFaceDetector();

    setState(() {
      _scannedQrToken = qrCode;
      _currentStep = VerificationStep.checkingLocation;
      _statusMessage = "Verifying Environment...";
    });

    await _checkLocation();
  }

  Future<void> _checkLocation() async {
    try {
      // Use cached data if available, otherwise fetch fresh
      if (_cachedLocationData != null) {
        _locationData = _cachedLocationData;
      } else {
        final position = await _sensorService.getCurrentPosition();
        _locationData = {
          "lat": position.latitude,
          "lon": position.longitude,
          "accuracy": position.accuracy,
          "is_mock": position.isMocked
        };
      }
      
      setState(() {
        _currentStep = VerificationStep.checkingDevice;
        _statusMessage = "Location verified! Checking device...";
      });

      // No delay - proceed immediately
      await _checkDevice();
    } catch (e) {
      setState(() {
        _currentStep = VerificationStep.failure;
        _statusMessage = "Location Check Failed";
        _errorDetails = e.toString();
      });
    }
  }

  Future<void> _checkDevice() async {
    try {
      // Use cached data if available, otherwise fetch fresh
      if (_cachedDeviceInfo != null) {
        _deviceInfo = _cachedDeviceInfo;
      } else {
        final deviceInfo = await _sensorService.getDeviceInfo();
        _deviceInfo = {
          "id": deviceInfo['id'],
          "model": deviceInfo['model'],
          "platform": Platform.isAndroid ? "android" : "ios",
        };
      }
      
      setState(() {
        _currentStep = VerificationStep.verifyingFace;
        _statusMessage = "Switching to face verification...";
      });

      // No delay - switch camera immediately
      await _switchCamera(CameraLensDirection.front);
      
      // Start challenge timer and reset state
      _challengeStartTime = DateTime.now();
      _challengeProgress = 0;
      _challengeCompleted = false;
      _blinkCount = 0;
      _isEyeClosed = false;
      _isSmileDetected = false;
      _lastHeadAngleY = null;
      
      setState(() {
        if (_currentChallenge != null) {
          _statusMessage = _currentChallenge!.instruction;
        } else {
          _statusMessage = "Please look at the camera";
        }
      });
    } catch (e) {
      setState(() {
        _currentStep = VerificationStep.failure;
        _statusMessage = "Device Check Failed";
        _errorDetails = e.toString();
      });
    }
  }

  void _checkLiveness(List<Face> faces) {
    if (faces.isEmpty) {
      if (mounted) setState(() => _statusMessage = "No face detected");
      return;
    }

    if (faces.length > 1) {
      if (mounted) setState(() => _statusMessage = "Multiple faces detected");
      return;
    }

    final face = faces.first;
    final headAngleY = face.headEulerAngleY ?? 0;
    
    // Track basics for logging (relaxed thresholds)
    if (headAngleY.abs() > 5) _headRotationDetected = true;
    
    // Blink detection logic for global state (and challenge)
    final leftOpen = face.leftEyeOpenProbability ?? 1.0;
    final rightOpen = face.rightEyeOpenProbability ?? 1.0;
    final isBlinking = leftOpen < 0.2 && rightOpen < 0.2;
    
    if (isBlinking) {
       _blinkDetected = true; // Historical flag
       if (!_isEyeClosed) {
         _isEyeClosed = true; // Eyes just closed
       }
    } else {
       if (_isEyeClosed) {
         _isEyeClosed = false; // Eyes just opened -> Blink complete
         _blinkCount++;
         if (_currentChallenge?.type == ChallengeType.blink) {
            _challengeProgress++;
            HapticFeedback.lightImpact();
         }
       }
    }
    
    // Smile detection
    final smileProb = face.smilingProbability ?? 0.0;
    if (smileProb > 0.8) {
       _isSmileDetected = true;
    }

    _faceCheckCount++;
    
    // Challenge verification
    if (_currentChallenge != null && !_challengeCompleted) {
      _verifyChallengeProgress(face); // Pass full face object
    }

    // Completion check
    if (_currentChallenge != null) {
      if (_challengeCompleted) {
        _submitAttendance();
      } else {
         // Update status with progress if needed
         if (_currentChallenge?.type == ChallengeType.blink && _currentChallenge!.param > 1) {
             setState(() => _statusMessage = "${_currentChallenge!.instruction} ($_challengeProgress/${_currentChallenge!.param})");
         } 
         // else keep original instruction
      }
    } else {
      // Fallback if no challenge (shouldn't happen with new logic, but safe)
      if (_faceCheckCount > 10) _submitAttendance();
    }
  }
  
  void _verifyChallengeProgress(Face face) {
    if (_currentChallenge == null) return;
    
    final type = _currentChallenge!.type;
    final headAngleY = face.headEulerAngleY ?? 0;
    
    switch (type) {
      case ChallengeType.smile:
        if ((face.smilingProbability ?? 0) > 0.8) {
          _challengeCompleted = true;
          HapticFeedback.mediumImpact();
        }
        break;
        
      case ChallengeType.blink:
        if (_challengeProgress >= _currentChallenge!.param) {
          _challengeCompleted = true;
          HapticFeedback.mediumImpact();
        }
        break;
        
      case ChallengeType.turnHeadLeft:
        // Mirror mode consideration: 
        // If un-mirrored: Left turn is AngleY > 0 (usually)
        // Check standard Android Main Camera orientation:
        // Usually, looking LEFT gives a POSITIVE Y angle (e.g. +30) on front camera mirror?
        // Let's assume standard front camera behavior. ML Kit usually reports:
        // Turn RIGHT (your right) -> Negative Y
        // Turn LEFT (your left) -> Positive Y
        if (headAngleY > 20) {
           _challengeCompleted = true;
           HapticFeedback.mediumImpact();
        }
        break;
        
      case ChallengeType.turnHeadRight:
        if (headAngleY < -20) {
           _challengeCompleted = true;
           HapticFeedback.mediumImpact();
        }
        break;
    }
  }

  Future<void> _submitAttendance() async {
    if (_currentStep == VerificationStep.submitting) return;
    
    await _controller?.stopImageStream();
    
    setState(() {
      _currentStep = VerificationStep.submitting;
      _statusMessage = "Submitting attendance...";
    });

    try {
      // Calculate challenge response time
      final responseTimeMs = _challengeStartTime != null
          ? DateTime.now().difference(_challengeStartTime!).inMilliseconds
          : 0;
      final timestampMs = DateTime.now().millisecondsSinceEpoch;
      String? signature;
      
      if (_challengeSeed != null && _currentChallenge != null) {
        signature = generateChallengeSignature(
          seed: _challengeSeed!,
          challengeType: _currentChallenge!.type.value,
          challengeParam: _currentChallenge!.param,
          timestampMs: timestampMs,
        );
      }

      final payload = {
        "qr_token": _scannedQrToken,
        "location": _locationData,
        "device_info": _deviceInfo,
        "liveness_metrics": {
          "blink_detected": _blinkDetected,
          "head_rotation_check": _headRotationDetected,
          "confidence": 0.95,
          "challenge_type": _currentChallenge?.type.value,
          "challenge_param": _currentChallenge?.param,
          "challenge_completed": _challengeCompleted,
          "challenge_response_time_ms": responseTimeMs,
          "challenge_signature": signature,
          "challenge_signature_timestamp_ms": timestampMs,
        }
      };


      final response = await _apiService.verifyAttendance(payload);
      
      if (mounted && response['success'] == true) {
        setState(() {
          _currentStep = VerificationStep.success;
          _statusMessage = response['message'] ?? "Attendance marked successfully!";
        });
        _animationController.forward();
        HapticFeedback.heavyImpact();
      } else {
        throw Exception(response['message'] ?? "Verification failed");
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _currentStep = VerificationStep.failure;
          _statusMessage = "Verification Failed";
          _errorDetails = e.toString();
        });
        HapticFeedback.vibrate();
      }
    }
  }

  InputImage? _inputImageFromCameraImage(CameraImage image) {
    final camera = _controller!.description;
    final sensorOrientation = camera.sensorOrientation;
    final rotations = InputImageRotationValue.fromRawValue(sensorOrientation);
    if (rotations == null) return null;

    final format = InputImageFormatValue.fromRawValue(image.format.raw);
    if (format == null) return null;

    return InputImage.fromBytes(
      bytes: _concatenatePlanes(image.planes),
      metadata: InputImageMetadata(
        size: Size(image.width.toDouble(), image.height.toDouble()),
        rotation: rotations,
        format: format,
        bytesPerRow: image.planes.first.bytesPerRow,
      ),
    );
  }

  Uint8List _concatenatePlanes(List<Plane> planes) {
    final WriteBuffer allBytes = WriteBuffer();
    for (final Plane plane in planes) {
      allBytes.putUint8List(plane.bytes);
    }
    return allBytes.done().buffer.asUint8List();
  }

  @override
  void dispose() {
    _controller?.dispose();
    _faceDetector?.close();
    _barcodeScanner.close();
    _animationController.dispose();
    super.dispose();
  }

  Future<void> _resetScan() async {
    setState(() {
      _currentStep = VerificationStep.scanningQR;
      _statusMessage = null;
      _errorDetails = null;
      _scannedQrToken = null;
      _locationData = null;
      _deviceInfo = null;
      _blinkDetected = false;
      _headRotationDetected = false;
      _faceCheckCount = 0;
      // Reset challenge state
      _currentChallenge = null;
      _challengeSeed = null;
      _challengeStartTime = null;
      _challengeCompleted = false;
      _challengeProgress = 0;
      _lastHeadAngleY = null;
      _isEyeClosed = false;
      _blinkCount = 0;
      _isSmileDetected = false;
    });
    _animationController.reset();
    _preloadData(); // Re-preload data for next scan
    await _switchCamera(CameraLensDirection.back);
  }

  Color _getStepColor() {
    switch (_currentStep) {
      case VerificationStep.scanningQR:
        return Colors.blue;
      case VerificationStep.checkingLocation:
      case VerificationStep.checkingDevice:
        return Colors.orange;
      case VerificationStep.verifyingFace:
        return Colors.purple;
      case VerificationStep.submitting:
        return Colors.amber;
      case VerificationStep.success:
        return Colors.green;
      case VerificationStep.failure:
        return Colors.red;
    }
  }

  String _getStepTitle() {
    switch (_currentStep) {
      case VerificationStep.scanningQR:
        return "Scan QR Code";
      case VerificationStep.checkingLocation:
        return "Verifying Location";
      case VerificationStep.checkingDevice:
        return "Verifying Device";
      case VerificationStep.verifyingFace:
        return "Face Verification";
      case VerificationStep.submitting:
        return "Submitting";
      case VerificationStep.success:
        return "Success";
      case VerificationStep.failure:
        return "Failed";
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_controller == null || !_controller!.value.isInitialized) {
      return const Scaffold(
        backgroundColor: Color(0xFF002D62),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              CircularProgressIndicator(color: Colors.white),
              SizedBox(height: 16),
              Text(
                'Initializing camera...',
                style: TextStyle(color: Colors.white),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: _currentStep == VerificationStep.success || _currentStep == VerificationStep.failure
          ? null
          : AppBar(
              backgroundColor: Colors.transparent,
              elevation: 0,
              leading: IconButton(
                icon: const Icon(Icons.close, color: Colors.white),
                onPressed: () => Navigator.of(context).pop(),
              ),
              title: Text(
                _getStepTitle(),
                style: const TextStyle(color: Colors.white),
              ),
            ),
      body: _currentStep == VerificationStep.success
          ? _buildSuccessScreen()
          : _currentStep == VerificationStep.failure
              ? _buildFailureScreen()
              : _buildCameraScreen(),
    );
  }

  Widget _buildCameraScreen() {
    return Stack(
      children: [
        SizedBox.expand(
          child: FittedBox(
            fit: BoxFit.cover,
            child: SizedBox(
              width: _controller!.value.previewSize!.height,
              height: _controller!.value.previewSize!.width,
              child: CameraPreview(_controller!),
            ),
          ),
        ),
        
        // Face Verification Overlay with Animation
        if (_currentStep == VerificationStep.verifyingFace)
          Center(
             child: Column(
               mainAxisAlignment: MainAxisAlignment.center,
               children: [
                  Container(
                    width: 300,
                    height: 400,
                    decoration: BoxDecoration(
                      border: Border.all(
                        color: _blinkDetected ? Colors.green : Colors.white.withOpacity(0.5),
                        width: 4,
                      ),
                      borderRadius: BorderRadius.circular(200),
                    ),
                    child: Center(
                       child: _currentChallenge != null 
                         ? ChallengeAnimation(type: _currentChallenge!.type, size: 150)
                         : null,
                    ),
                  ),
               ],
             )
          ),

        // Processing Overlay (Hidden Check Steps)
        if (_currentStep != VerificationStep.scanningQR && 
            _currentStep != VerificationStep.verifyingFace &&
            _currentStep != VerificationStep.success &&
            _currentStep != VerificationStep.failure)
           Container(
             color: Colors.black45,
             child: Center(
               child: Column(
                 mainAxisSize: MainAxisSize.min,
                 children: [
                   const CircularProgressIndicator(color: Colors.white),
                   const SizedBox(height: 20),
                   Text(
                      _statusMessage ?? "Processing...",
                      style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
                   )
                 ],
               ),
             ),
           ),

        // Footer Status Pill
        Positioned(
          bottom: 50,
          left: 30,
          right: 30,
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 24),
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.7),
              borderRadius: BorderRadius.circular(30),
              border: Border.all(color: Colors.white24)
            ),
            child: Text(
               _statusMessage ?? "Scan QR Code",
               textAlign: TextAlign.center,
               style: const TextStyle(color: Colors.white, fontSize: 16),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildSuccessScreen() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF00C853), Color(0xFF00E676)],
        ),
      ),
      child: SafeArea(
        child: Center(
          child: ScaleTransition(
            scale: _scaleAnimation,
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 120,
                  height: 120,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.2),
                        blurRadius: 20,
                        offset: const Offset(0, 10),
                      ),
                    ],
                  ),
                  child: const Icon(
                    Icons.check_circle,
                    color: Color(0xFF00C853),
                    size: 80,
                  ),
                ),
                const SizedBox(height: 32),
                const Text(
                  "Attendance Marked!",
                  style: TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 16),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 40),
                  child: Text(
                    _statusMessage ?? "Your attendance has been successfully recorded.",
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 16,
                      color: Colors.white,
                    ),
                  ),
                ),
                const SizedBox(height: 48),
                ElevatedButton.icon(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.home),
                  label: const Text('Back to Dashboard'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: const Color(0xFF00C853),
                    padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(30),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                TextButton.icon(
                  onPressed: _resetScan,
                  icon: const Icon(Icons.qr_code_scanner, color: Colors.white),
                  label: const Text(
                    'Scan Another',
                    style: TextStyle(color: Colors.white),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildFailureScreen() {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFD32F2F), Color(0xFFE57373)],
        ),
      ),
      child: SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(32.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 120,
                  height: 120,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.2),
                        blurRadius: 20,
                        offset: const Offset(0, 10),
                      ),
                    ],
                  ),
                  child: const Icon(
                    Icons.error_outline,
                    color: Color(0xFFD32F2F),
                    size: 80,
                  ),
                ),
                const SizedBox(height: 32),
                const Text(
                  "Verification Failed",
                  style: TextStyle(
                    fontSize: 32,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  _statusMessage ?? "Unable to verify your attendance",
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 18,
                    color: Colors.white,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                if (_errorDetails != null) ...[
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      _errorDetails!,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 14,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 48),
                ElevatedButton.icon(
                  onPressed: _resetScan,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Try Again'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: const Color(0xFFD32F2F),
                    padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(30),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                TextButton.icon(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.home, color: Colors.white),
                  label: const Text(
                    'Back to Dashboard',
                    style: TextStyle(color: Colors.white),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
