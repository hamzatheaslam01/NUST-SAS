import 'package:geolocator/geolocator.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'dart:io';

class SensorService {
  final DeviceInfoPlugin _deviceInfo = DeviceInfoPlugin();

  Future<Position> getCurrentPosition() async {
    bool serviceEnabled;
    LocationPermission permission;

    // Test if location services are enabled.
    serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      return Future.error('Location services are disabled.');
    }

    permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        return Future.error('Location permissions are denied');
      }
    }
    
    if (permission == LocationPermission.deniedForever) {
      return Future.error(
        'Location permissions are permanently denied, we cannot request permissions.');
    } 

    // Get current position
    Position position = await Geolocator.getCurrentPosition(
      desiredAccuracy: LocationAccuracy.bestForNavigation
    );

    // Check for Mock Location
    if (position.isMocked) {
      throw Exception("Mock Location Detected! Disable FakeGPS apps.");
    }

    return position;
  }

  Future<Map<String, String>> getDeviceInfo() async {
    String deviceId = 'unknown';
    String model = 'unknown';
    String platform = 'unknown';

    if (Platform.isAndroid) {
      AndroidDeviceInfo androidInfo = await _deviceInfo.androidInfo;
      deviceId = androidInfo.id;
      model = androidInfo.model;
      platform = 'android';
    } else if (Platform.isIOS) {
      IosDeviceInfo iosInfo = await _deviceInfo.iosInfo;
      deviceId = iosInfo.identifierForVendor ?? 'unknown';
      model = iosInfo.model;
      platform = 'ios';
    }

    return {
      'id': deviceId,
      'model': model,
      'platform': platform,
    };
  }
}
