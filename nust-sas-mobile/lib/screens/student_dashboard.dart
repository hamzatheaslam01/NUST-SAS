import 'package:flutter/material.dart';
import '../services/api_service.dart';
import 'scan_screen.dart';
import 'login_screen.dart';

class StudentDashboard extends StatefulWidget {
  const StudentDashboard({super.key});

  @override
  State<StudentDashboard> createState() => _StudentDashboardState();
}

class _StudentDashboardState extends State<StudentDashboard> {
  final ApiService _apiService = ApiService();
  String? _email;
  String? _cmsId;
  bool _isLoading = true;
  List<dynamic> _history = [];

  @override
  void initState() {
    super.initState();
    _loadUserInfo();
  }

  Future<void> _loadUserInfo() async {
    try {
      final email = await _apiService.getUserEmail();
      final cmsId = await _apiService.getUserCmsId();
      final history = await _apiService.getAttendanceHistory();
      
      setState(() {
        _email = email;
        _cmsId = cmsId;
        _history = history;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
      });
    }
  }

  Future<void> _logout() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Logout'),
        content: const Text('Are you sure you want to logout?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Logout', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );

    if (confirm == true && mounted) {
      await _apiService.logout();
      if (mounted) {
        Navigator.of(context).pushAndRemoveUntil(
          MaterialPageRoute(builder: (context) => const LoginScreen()),
          (route) => false,
        );
      }
    }
  }

  void _navigateToScan() {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (context) => const ScanScreen()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: _isLoading
            ? const Center(child: CircularProgressIndicator())
            : CustomScrollView(
                slivers: [
                  SliverAppBar(
                    expandedHeight: 200,
                    floating: false,
                    pinned: true,
                    backgroundColor: const Color(0xFF002D62),
                    flexibleSpace: FlexibleSpaceBar(
                      title: const Text(
                        'NUST SAS',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: Colors.white,
                        ),
                      ),
                      background: Container(
                        decoration: const BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [
                              Color(0xFF002D62),
                              Color(0xFF004A99),
                            ],
                          ),
                        ),
                        child: const Center(
                          child: Icon(
                            Icons.school,
                            size: 80,
                            color: Colors.white24,
                          ),
                        ),
                      ),
                    ),
                    actions: [
                      IconButton(
                        icon: const Icon(Icons.logout),
                        onPressed: _logout,
                        tooltip: 'Logout',
                      ),
                    ],
                  ),
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.all(24.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Card(
                            elevation: 4,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16),
                            ),
                            child: Padding(
                              padding: const EdgeInsets.all(24.0),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Container(
                                        padding: const EdgeInsets.all(12),
                                        decoration: BoxDecoration(
                                          color: const Color(0xFF002D62).withOpacity(0.1),
                                          borderRadius: BorderRadius.circular(12),
                                        ),
                                        child: const Icon(
                                          Icons.person,
                                          size: 32,
                                          color: Color(0xFF002D62),
                                        ),
                                      ),
                                      const SizedBox(width: 16),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              _cmsId ?? 'Loading...',
                                              style: const TextStyle(
                                                fontSize: 24,
                                                fontWeight: FontWeight.bold,
                                                color: Color(0xFF002D62),
                                              ),
                                            ),
                                            const SizedBox(height: 4),
                                            Text(
                                              _email ?? 'Loading...',
                                              style: TextStyle(
                                                fontSize: 14,
                                                color: Colors.grey[600],
                                              ),
                                            ),
                                          ],
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 16),
                                  const Divider(),
                                  const SizedBox(height: 16),
                                  Row(
                                    children: [
                                      Icon(Icons.verified_user, size: 20, color: Colors.green[700]),
                                      const SizedBox(width: 8),
                                      Text(
                                        'Verified Student',
                                        style: TextStyle(
                                          fontSize: 14,
                                          color: Colors.green[700],
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 24),
                          Row(
                            children: [
                              Expanded(
                                child: Container(
                                  height: 140,
                                  padding: const EdgeInsets.all(16),
                                  decoration: BoxDecoration(
                                    color: Colors.blue.shade50,
                                    borderRadius: BorderRadius.circular(20),
                                    border: Border.all(color: Colors.blue.shade100),
                                  ),
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Stack(
                                        alignment: Alignment.center,
                                        children: [
                                          SizedBox(
                                            height: 60,
                                            width: 60,
                                            child: CircularProgressIndicator(
                                              value: _history.isEmpty ? 1.0 : (_history.where((h) => h['status'] == 'SUCCESS').length / _history.length),
                                              backgroundColor: Colors.white,
                                              color: const Color(0xFF002D62),
                                              strokeWidth: 8,
                                            ),
                                          ),
                                          Text(
                                            _history.isEmpty ? "100" : "${((_history.where((h) => h['status'] == 'SUCCESS').length / _history.length) * 100).toInt()}",
                                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: Color(0xFF002D62)),
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 8),
                                      const Text("Reliability", style: TextStyle(color: Color(0xFF002D62), fontWeight: FontWeight.w600)),
                                    ],
                                  ),
                                ),
                              ),
                              const SizedBox(width: 16),
                              Expanded(
                                child: GestureDetector(
                                  onTap: _navigateToScan,
                                  child: Container(
                                    height: 140,
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF002D62),
                                      borderRadius: BorderRadius.circular(20),
                                      boxShadow: [
                                        BoxShadow(
                                          color: const Color(0xFF002D62).withOpacity(0.3),
                                          blurRadius: 10,
                                          offset: const Offset(0, 4),
                                        ),
                                      ],
                                    ),
                                    child: const Column(
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      children: [
                                        Icon(Icons.qr_code_scanner, color: Colors.white, size: 48),
                                        SizedBox(height: 8),
                                        Text("Scan QR", style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 32),
                          const Text(
                            "Recent Activity",
                            style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Color(0xFF002D62)),
                          ),
                          const SizedBox(height: 16),
                          if (_history.isEmpty)
                             const Center(child: Padding(padding: EdgeInsets.all(16), child: Text("No history available"))),
                          ..._history.take(5).map((log) => Card(
                            margin: const EdgeInsets.only(bottom: 12),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            child: ListTile(
                              leading: Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: log['status'] == 'SUCCESS' ? Colors.green.shade50 : Colors.red.shade50,
                                  shape: BoxShape.circle,
                                ),
                                child: Icon(
                                  log['status'] == 'SUCCESS' ? Icons.check : Icons.close,
                                  color: log['status'] == 'SUCCESS' ? Colors.green : Colors.red,
                                  size: 20,
                                ),
                              ),
                              title: Text(log['course_code'] ?? 'Unknown Class', style: const TextStyle(fontWeight: FontWeight.bold)),
                              subtitle: Text(log['timestamp'] != null ? DateTime.parse(log['timestamp']).toLocal().toString().split('.')[0] : ''),
                              trailing: Text(
                                log['status'] == 'SUCCESS' ? 'Present' : 'Failed',
                                style: TextStyle(
                                  color: log['status'] == 'SUCCESS' ? Colors.green : Colors.red,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                          )).toList(),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
      ),
    );
  }


}
