import 'dart:math';
import 'package:flutter/material.dart';
import '../services/challenge_service.dart';

class ChallengeAnimation extends StatefulWidget {
  final ChallengeType type;
  final double size;
  final Color color;

  const ChallengeAnimation({
    super.key,
    required this.type,
    this.size = 100,
    this.color = Colors.white,
  });

  @override
  State<ChallengeAnimation> createState() => _ChallengeAnimationState();
}

class _ChallengeAnimationState extends State<ChallengeAnimation>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: widget.size,
      height: widget.size,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) {
          return CustomPaint(
            painter: _getPainter(),
            size: Size(widget.size, widget.size),
          );
        },
      ),
    );
  }

  CustomPainter _getPainter() {
    switch (widget.type) {
      case ChallengeType.smile:
        return _SmilePainter(_controller.value, widget.color);
      case ChallengeType.blink:
        return _BlinkPainter(_controller.value, widget.color);
      case ChallengeType.turnHeadLeft:
        return _TurnHeadPainter(_controller.value, widget.color, true); // true = left
      case ChallengeType.turnHeadRight:
        return _TurnHeadPainter(_controller.value, widget.color, false); // false = right
      default:
        return _FaceScanPainter(_controller.value, widget.color);
    }
  }
}

class _SmilePainter extends CustomPainter {
  final double progress;
  final Color color;

  _SmilePainter(this.progress, this.color);

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.0
      ..strokeCap = StrokeCap.round;

    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2.5;

    // Face outline
    canvas.drawCircle(center, radius, paint);

    // Eyes
    final eyeOffset = radius * 0.35;
    canvas.drawCircle(center + Offset(-eyeOffset, -eyeOffset), radius * 0.1, paint..style = PaintingStyle.fill);
    canvas.drawCircle(center + Offset(eyeOffset, -eyeOffset), radius * 0.1, paint..style = PaintingStyle.fill);
    
    // Mouth (Smile animation)
    paint.style = PaintingStyle.stroke;
    final mouthWidth = radius * 0.8;
    final smileFactor = sin(progress * 2 * pi).abs(); // 0 -> 1 -> 0
    
    final mouthRect = Rect.fromCenter(
      center: center + Offset(0, radius * 0.2),
      width: mouthWidth,
      height: mouthWidth * (0.2 + 0.6 * smileFactor), // Height increases
    );
    
    // Draw arc for mouth
    canvas.drawArc(mouthRect, 0.1 * pi, 0.8 * pi, false, paint);
  }

  @override
  bool shouldRepaint(_SmilePainter oldDelegate) => true;
}

class _BlinkPainter extends CustomPainter {
  final double progress;
  final Color color;

  _BlinkPainter(this.progress, this.color);

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.0;

    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2.5;

    // Face outline
    canvas.drawCircle(center, radius, paint);
    
    // Eyes
    final eyeOffset = radius * 0.35;
    final eyeRadius = radius * 0.15;
    
    final blinkFactor = sin(progress * 4 * pi).abs(); // Fast blinks
    // If factor > 0.8, eyes closed
    
    final isClosed = blinkFactor > 0.8;
    
    if (isClosed) {
       // Draw lines
       canvas.drawLine(
         center + Offset(-eyeOffset - eyeRadius, -eyeOffset),
         center + Offset(-eyeOffset + eyeRadius, -eyeOffset),
         paint
       );
       canvas.drawLine(
         center + Offset(eyeOffset - eyeRadius, -eyeOffset),
         center + Offset(eyeOffset + eyeRadius, -eyeOffset),
         paint
       );
    } else {
       // Draw circles
       paint.style = PaintingStyle.fill;
       canvas.drawCircle(center + Offset(-eyeOffset, -eyeOffset), eyeRadius, paint);
       canvas.drawCircle(center + Offset(eyeOffset, -eyeOffset), eyeRadius, paint);
    }
  }

  @override
  bool shouldRepaint(_BlinkPainter oldDelegate) => true;
}

class _TurnHeadPainter extends CustomPainter {
  final double progress;
  final Color color;
  final bool isLeft;

  _TurnHeadPainter(this.progress, this.color, this.isLeft);

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3.0;

    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2.5;
    
    // Animate offset
    final moveFactor = sin(progress * 2 * pi).abs();
    final xOffset = isLeft ? -20 * moveFactor : 20 * moveFactor;
    
    // Face outline moving
    canvas.drawCircle(center + Offset(xOffset, 0), radius, paint);
    
    // Arrow
    final arrowPaint = Paint()
      ..color = color.withOpacity(0.7)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4.0
      ..strokeCap = StrokeCap.round;
      
    final arrowStart = center + Offset(isLeft ? 40 : -40, radius + 20);
    final arrowEnd = center + Offset(isLeft ? -40 : 40, radius + 20);
    
    // canvas.drawLine(arrowStart, arrowEnd, arrowPaint);
    // Draw arrow head
    if (moveFactor > 0.2) {
       _drawArrow(canvas, center + Offset(0, radius + 30), isLeft ? pi : 0, arrowPaint);
    }
  }
  
  void _drawArrow(Canvas canvas, Offset pos, double angle, Paint paint) {
    canvas.save();
    canvas.translate(pos.dx, pos.dy);
    canvas.rotate(angle);
    final path = Path();
    path.moveTo(-10, -10);
    path.lineTo(10, 0); // pointing right (0 rad)
    path.lineTo(-10, 10);
    canvas.drawPath(path, paint);
    canvas.restore();
  }

  @override
  bool shouldRepaint(_TurnHeadPainter oldDelegate) => true;
}

class _FaceScanPainter extends CustomPainter {
  final double progress;
  final Color color;

  _FaceScanPainter(this.progress, this.color);

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color.withOpacity(0.5)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0;

    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2.5;

    canvas.drawCircle(center, radius, paint);
    
    // Scan line
    final scanPaint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0;
      
    final scanY = center.dy - radius + (radius * 2 * progress);
    
    if (scanY > center.dy - radius && scanY < center.dy + radius) {
       final widthAtY = sqrt(radius*radius - pow(scanY - center.dy, 2));
       canvas.drawLine(
         Offset(center.dx - widthAtY, scanY),
         Offset(center.dx + widthAtY, scanY),
         scanPaint
       );
    }
  }

  @override
  bool shouldRepaint(_FaceScanPainter oldDelegate) => true;
}
