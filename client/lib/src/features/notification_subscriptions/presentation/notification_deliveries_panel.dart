import 'package:flutter/material.dart';
import '../../../core/utils/date_time_formatter.dart';
import '../data/notification_deliveries_repository.dart';
import '../domain/notification_delivery.dart';

class NotificationDeliveriesPanel extends StatefulWidget {
  const NotificationDeliveriesPanel({super.key, required this.repository});
  final NotificationDeliveriesRepository repository;
  @override State<NotificationDeliveriesPanel> createState() => _NotificationDeliveriesPanelState();
}

class _NotificationDeliveriesPanelState extends State<NotificationDeliveriesPanel> {
  bool loading = true; String? error; List<NotificationDelivery> items = const [];
  @override void initState() { super.initState(); _load(); }
  Future<void> _load() async { setState(() { loading = true; error = null; }); try { items = await widget.repository.getDeliveries(); } catch (e) { error = e.toString(); } finally { if (mounted) setState(() => loading = false); } }
  @override Widget build(BuildContext context) => Card(child: Padding(padding: const EdgeInsets.all(16), child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Row(children: [Expanded(child: Text('通知投递记录', style: Theme.of(context).textTheme.titleMedium)), IconButton(onPressed: loading ? null : _load, icon: const Icon(Icons.refresh))]), if (loading) const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator())) else if (error != null) Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error)) else if (items.isEmpty) const Text('暂无投递记录') else ...items.map((item) => ListTile(contentPadding: EdgeInsets.zero, title: Text('${item.channel} · ${item.status}'), subtitle: Text('尝试 ${item.attemptCount} 次 · ${formatDateTime(item.createdAt)}${item.errorCode == null ? '' : ' · ${item.errorCode}'}'), trailing: Text(item.responseCode?.toString() ?? '-')))])));
}