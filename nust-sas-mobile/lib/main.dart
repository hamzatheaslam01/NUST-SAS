import 'package:flutter/material.dart';
import 'theme.dart';
import 'screens/login_screen.dart';
import 'screens/student_dashboard.dart';
import 'services/api_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  runApp(const NustSasApp());
}

class NustSasApp extends StatelessWidget {
  const NustSasApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'NUST SAS',
      theme: AppTheme.lightTheme,
      debugShowCheckedModeBanner: false,
      home: const AuthGate(),
    );
  }
}

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  final ApiService _apiService = ApiService();
  
  Future<String?> _checkAuth() async {
    // Try to find the correct backend URL
    await _apiService.testConnection();
    return await _apiService.getStoredToken();
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<String?>(
      future: _checkAuth(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(
              child: CircularProgressIndicator(),
            ),
          );
        }
        
        final token = snapshot.data;

        if (token != null) {
          return const StudentDashboard();
        } else {
          return const LoginScreen();
        }
      },
    );
  }
}
