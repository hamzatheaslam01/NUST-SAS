import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config.dart';

class ApiService {
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;

  final Dio _dio = Dio();
  String _baseUrl = Config.apiBaseUrl;
  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  
  ApiService._internal() {
    _dio.options.connectTimeout = const Duration(seconds: 5);
    _dio.options.receiveTimeout = const Duration(seconds: 10);
    _dio.options.sendTimeout = const Duration(seconds: 10);
  }

  Exception _handleDioError(DioException e) {
    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout ||
        e.type == DioExceptionType.sendTimeout) {
      return Exception("Connection timeout. Please check your internet connection.");
    } else if (e.type == DioExceptionType.connectionError) {
      return Exception("Cannot connect to server. Please check if the server is running.");
    } else if (e.response != null) {
      final data = e.response?.data;
      if (data is Map && data.containsKey('detail')) {
        return Exception(data['detail']);
      } else if (data is Map && data.containsKey('message')) {
        return Exception(data['message']);
      }
      return Exception("Server Error: ${e.response?.statusCode}");
    } else {
      return Exception("Network Error: ${e.message}");
    }
  }

  Future<void> registerUser({
    required String email,
    required String password,
    required String cmsId,
    List<double>? faceEmbedding,
    required Map<String, dynamic> deviceInfo,
  }) async {
    try {
      final response = await _dio.post(
        '$_baseUrl/api/auth/register',
        data: {
          'email': email,
          'password': password,
          'cms_id': cmsId,
          'role': 'student',
          'face_embedding': faceEmbedding,
          'device_info': deviceInfo,
        },
      );

      if (response.statusCode != 200) {
        throw Exception("Registration failed: ${response.statusMessage}");
      }
    } on DioException catch (e) {
      throw _handleDioError(e);
    }
  }

  Future<Map<String, dynamic>> loginUser(String email, String password, {Map<String, dynamic>? deviceInfo}) async {
    try {
      final response = await _dio.post(
        '$_baseUrl/api/auth/login',
        data: {
          'email': email,
          'password': password,
          'device_info': deviceInfo,
        },
      );

      if (response.statusCode == 200) {
        final data = response.data;
        
        if (data is! Map<String, dynamic>) {
          throw Exception("Invalid server response format.");
        }

        await _storage.write(key: 'access_token', value: data['access_token']);
        await _storage.write(key: 'refresh_token', value: data['refresh_token']);
        
        if (data['user'] != null && data['user'] is Map) {
          await _storage.write(key: 'user_id', value: data['user']['id']);
          await _storage.write(key: 'user_email', value: data['user']['email']);
          await _storage.write(key: 'user_cms_id', value: data['user']['cms_id']);
        } else {
          throw Exception("Invalid server response: Missing user data");
        }
        
        return data;
      } else {
        throw Exception("Login failed: ${response.statusMessage}");
      }
    } on DioException catch (e) {
      throw _handleDioError(e);
    }
  }

  Future<String?> getStoredToken() async {
    return await _storage.read(key: 'access_token');
  }

  Future<String?> getUserId() async {
    return await _storage.read(key: 'user_id');
  }

  Future<String?> getUserEmail() async {
    return await _storage.read(key: 'user_email');
  }

  Future<String?> getUserCmsId() async {
    return await _storage.read(key: 'user_cms_id');
  }

  Future<void> logout() async {
    await _storage.deleteAll();
  }

  Future<bool> testConnection() async {
    try {
      print('Testing connection to $_baseUrl...');
      final response = await _dio.get('$_baseUrl/');
      if (response.statusCode == 200) {
        print('Connected to $_baseUrl');
        return true;
      }
    } catch (e) {
      print('Failed to connect to $_baseUrl: $e');
    }

    print('Trying other URLs...');
    for (final url in Config.apiBaseUrls) {
      if (url == _baseUrl) continue;
      try {
        print('Testing connection to $url...');
        final response = await _dio.get('$url/');
        if (response.statusCode == 200) {
          _baseUrl = url;
          print('Connected to $_baseUrl');
          return true;
        }
      } catch (e) {
        print('Failed to connect to $url: $e');
        continue;
      }
    }
    return false;
  }

  Future<Map<String, dynamic>> generateQR(String sessionId) async {
    final token = await getStoredToken();
    if (token == null) {
      throw Exception("User not authenticated");
    }

    try {
      final response = await _dio.get(
        '$_baseUrl/api/session/$sessionId/qr',
        options: Options(
          headers: {
            "Authorization": "Bearer $token",
            "Content-Type": "application/json"
          }
        )
      );

      if (response.statusCode == 200) {
        final data = response.data;
        if (data is! Map<String, dynamic>) {
          throw Exception("Invalid server response format.");
        }
        return data;
      } else {
        throw Exception("QR Generation Error: ${response.statusMessage}");
      }
    } on DioException catch (e) {
      throw _handleDioError(e);
    }
  }

  Future<Map<String, dynamic>> verifyAttendance(Map<String, dynamic> payload) async {
    final token = await getStoredToken();
    
    if (token == null) {
      throw Exception("User not authenticated");
    }

    try {
      final response = await _dio.post(
        '$_baseUrl/api/attendance/verify',
        data: payload,
        options: Options(
          headers: {
            "Authorization": "Bearer $token",
            "Content-Type": "application/json"
          }
        )
      );

      if (response.statusCode == 200) {
        final data = response.data;
        if (data is! Map<String, dynamic>) {
          throw Exception("Invalid server response format.");
        }
        return data;
      } else {
        throw Exception("Verification failed: ${response.statusMessage}");
      }
    } on DioException catch (e) {
      throw _handleDioError(e);
    }
  }

  Future<List<dynamic>> getAttendanceHistory() async {
    final token = await getStoredToken();
    if (token == null) throw Exception("Not authenticated");

    try {
      final response = await _dio.get(
        '$_baseUrl/api/attendance/history',
        options: Options(headers: {"Authorization": "Bearer $token"})
      );
      if (response.statusCode == 200) {
        return response.data as List<dynamic>;
      }
      throw Exception("Failed to fetch history");
    } on DioException catch (e) {
      throw _handleDioError(e);
    }
  }
}
