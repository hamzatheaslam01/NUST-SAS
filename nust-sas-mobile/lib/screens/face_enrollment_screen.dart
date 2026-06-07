import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_mlkit_face_detection/google_mlkit_face_detection.dart';
import 'dart:io';

class FaceEnrollmentScreen extends StatefulWidget {
  const FaceEnrollmentScreen({super.key});

  @override
  State<FaceEnrollmentScreen> createState() => _FaceEnrollmentScreenState();
}

class _FaceEnrollmentScreenState extends State<FaceEnrollmentScreen> {
  CameraController? _controller;
  bool _isBusy = false;
  String? _statusMessage;
  late FaceDetector _faceDetector;
  bool _faceDetected = false;
  bool _faceQualityGood = false;
  int _captureCountdown = 0;
  List<double>? _faceEmbedding;

  @override
  void initState() {
    super.initState();
    _initializeDetector();
    _initializeCamera();
  }

  void _initializeDetector() {
    final options = FaceDetectorOptions(
      enableClassification: true,
      enableLandmarks: true,
      performanceMode: FaceDetectorMode.accurate,
    );
    _faceDetector = FaceDetector(options: options);
  }

  Future<void> _initializeCamera() async {
    final cameras = await availableCameras();
    final frontCamera = cameras.firstWhere(
      (camera) => camera.lensDirection == CameraLensDirection.front,
      orElse: () => cameras.first,
    );

    _controller = CameraController(
      frontCamera,
      ResolutionPreset.high,
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

  Future<void> _processImage(CameraImage image) async {
    if (_isBusy || _captureCountdown > 0) return;
    _isBusy = true;

    try {
      final inputImage = _inputImageFromCameraImage(image);
      if (inputImage == null) return;

      final faces = await _faceDetector.processImage(inputImage);
      
      if (faces.isEmpty) {
        setState(() {
          _faceDetected = false;
          _statusMessage = "No face detected. Please position your face in the frame.";
          _faceQualityGood = false;
        });
      } else if (faces.length > 1) {
        setState(() {
          _faceDetected = false;
          _statusMessage = "Multiple faces detected. Please ensure only you are in frame.";
          _faceQualityGood = false;
        });
      } else {
        final face = faces.first;
        final headAngleY = (face.headEulerAngleY ?? 0).abs();
        final headAngleZ = (face.headEulerAngleZ ?? 0).abs();
        
        final boundingBox = face.boundingBox;
        final frameWidth = image.width.toDouble();
        final frameHeight = image.height.toDouble();
        final faceArea = boundingBox.width * boundingBox.height;
        final frameArea = frameWidth * frameHeight;
        final faceRatio = faceArea / frameArea;

        if (headAngleY > 15 || headAngleZ > 15) {
          setState(() {
            _faceDetected = true;
            _statusMessage = "Please look straight at the camera.";
            _faceQualityGood = false;
          });
        } else if (faceRatio < 0.15) {
          setState(() {
            _faceDetected = true;
            _statusMessage = "Move closer to the camera.";
            _faceQualityGood = false;
          });
        } else if (faceRatio > 0.5) {
          setState(() {
            _faceDetected = true;
            _statusMessage = "Move back from the camera.";
            _faceQualityGood = false;
          });
        } else {
          setState(() {
            _faceDetected = true;
            _faceQualityGood = true;
            _statusMessage = "Perfect! Hold still...";
          });
          
          await _startCapture(face);
        }
      }
    } catch (e) {
      debugPrint('Error processing image: $e');
    } finally {
      _isBusy = false;
    }
  }

  Future<void> _startCapture(Face face) async {
    if (_captureCountdown > 0) return;
    
    setState(() {
      _captureCountdown = 3;
    });

    for (int i = 3; i > 0; i--) {
      await Future.delayed(const Duration(seconds: 1));
      if (!mounted) return;
      setState(() {
        _captureCountdown = i - 1;
      });
    }

    await _captureFaceEmbedding(face);
  }

  Future<void> _captureFaceEmbedding(Face face) async {
    await _controller?.stopImageStream();
    
    setState(() {
      _statusMessage = "Generating face signature...";
    });

    final boundingBox = face.boundingBox;
    _faceEmbedding = [
      boundingBox.left,
      boundingBox.top,
      boundingBox.width,
      boundingBox.height,
      face.headEulerAngleY ?? 0,
      face.headEulerAngleZ ?? 0,
      face.leftEyeOpenProbability ?? 1.0,
      face.rightEyeOpenProbability ?? 1.0,
    ];

    final landmarks = face.landmarks;
    for (var landmarkType in FaceLandmarkType.values) {
      final landmark = landmarks[landmarkType];
      if (landmark != null) {
        final position = landmark.position;
        if (position.x.isFinite && position.y.isFinite) {
          _faceEmbedding!.add(position.x.toDouble());
          _faceEmbedding!.add(position.y.toDouble());
        }
      }
    }

    await Future.delayed(const Duration(milliseconds: 500));
    
    if (mounted) {
      Navigator.of(context).pop(_faceEmbedding);
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
    _faceDetector.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_controller == null || !_controller!.value.isInitialized) {
      return const Scaffold(
        body: Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: const Text('Face Enrollment'),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: Stack(
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
          
          Container(
            decoration: BoxDecoration(
              border: Border.all(
                color: _faceQualityGood ? Colors.green : (_faceDetected ? Colors.orange : Colors.red),
                width: 4.0,
              ),
            ),
          ),

          Center(
            child: Container(
              width: 300,
              height: 400,
              decoration: BoxDecoration(
                border: Border.all(
                  color: _faceQualityGood ? Colors.green : Colors.white.withOpacity(0.5),
                  width: 3,
                ),
                borderRadius: BorderRadius.circular(200),
              ),
            ),
          ),

          Positioned(
            top: 60,
            left: 20,
            right: 20,
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 24),
              decoration: BoxDecoration(
                color: Colors.black87,
                borderRadius: BorderRadius.circular(30),
              ),
              child: Column(
                children: [
                  Text(
                    _statusMessage ?? "Position your face in the oval",
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.w500,
                    ),
                    textAlign: TextAlign.center,
                  ),
                  if (_captureCountdown > 0) ...[
                    const SizedBox(height: 8),
                    Text(
                      _captureCountdown.toString(),
                      style: const TextStyle(
                        color: Colors.green,
                        fontSize: 32,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),

          Positioned(
            bottom: 40,
            left: 20,
            right: 20,
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.black87,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildCheckItem("Face detected", _faceDetected),
                  const SizedBox(height: 8),
                  _buildCheckItem("Good quality", _faceQualityGood),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCheckItem(String label, bool checked) {
    return Row(
      children: [
        Icon(
          checked ? Icons.check_circle : Icons.radio_button_unchecked,
          color: checked ? Colors.green : Colors.grey,
          size: 20,
        ),
        const SizedBox(width: 8),
        Text(
          label,
          style: TextStyle(
            color: checked ? Colors.green : Colors.grey,
            fontSize: 14,
          ),
        ),
      ],
    );
  }
}
