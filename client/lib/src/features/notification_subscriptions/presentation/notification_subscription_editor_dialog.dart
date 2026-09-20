import 'package:flutter/material.dart';
import '../../../core/widgets/form_dialog_frame.dart';
import '../domain/notification_subscription_form_data.dart';

class NotificationSubscriptionEditorDialog extends StatefulWidget {
  const NotificationSubscriptionEditorDialog({super.key, required this.initialValue, required this.title, required this.submitLabel, required this.isEditing, this.availableChannels = const {'webhook', 'email', 'telegram'}});
  final NotificationSubscriptionFormData initialValue; final String title; final String submitLabel; final bool isEditing; final Set<String> availableChannels;
  @override State<NotificationSubscriptionEditorDialog> createState() => _NotificationSubscriptionEditorDialogState();
}

class _NotificationSubscriptionEditorDialogState extends State<NotificationSubscriptionEditorDialog> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _targetController;
  late final TextEditingController _secretController;
  late String _channel; late bool _enabled; late bool _clearSecret;
  @override void initState() { super.initState(); _channel=widget.initialValue.channel; _targetController=TextEditingController(text: widget.initialValue.targetValue); _secretController=TextEditingController(text: widget.initialValue.secret); _enabled=widget.initialValue.enabled; _clearSecret=widget.initialValue.clearSecret; }
  @override void dispose() { _targetController.dispose(); _secretController.dispose(); super.dispose(); }
  String get _label => switch (_channel) { 'email' => '收件邮箱', 'telegram' => 'Telegram Chat ID', _ => 'Webhook 地址' };
  @override Widget build(BuildContext context) => FormDialogFrame(
    formKey: _formKey, title: widget.title, description: '配置服务端支持的通知渠道。', maxWidth: 520,
    body: Column(mainAxisSize: MainAxisSize.min, children: [
      DropdownButtonFormField<String>(initialValue: _channel, decoration: const InputDecoration(labelText: '通知渠道'), items: const ['webhook','email','telegram'].where((channel) => widget.availableChannels.contains(channel)).map((channel) => DropdownMenuItem(value: channel, child: Text(channel == 'email' ? 'Email' : channel == 'telegram' ? 'Telegram' : 'Webhook'))).toList(growable: false), onChanged:(value){if(value!=null)setState((){_channel=value;_targetController.clear();});}),
      const SizedBox(height:12),
      TextFormField(controller:_targetController, decoration:InputDecoration(labelText:_label), validator:(value){final v=value?.trim()??'';if(v.isEmpty)return '请输入$_label';if(_channel=='email'&&(!v.contains('@')||v.startsWith('@')||v.endsWith('@')))return '请输入合法邮箱地址';if(_channel=='webhook'){final uri=Uri.tryParse(v);if(uri==null||(uri.scheme!='http'&&uri.scheme!='https')||uri.host.isEmpty)return '请输入合法 HTTP/HTTPS 地址';}return null;}),
      if(_channel=='webhook')...[
        const SizedBox(height:12), TextFormField(controller:_secretController,obscureText:true,decoration:InputDecoration(labelText:widget.isEditing?'新密钥（可选）':'签名密钥（可选）')),
        if(widget.isEditing)CheckboxListTile(value:_clearSecret,contentPadding:EdgeInsets.zero,title:const Text('清空现有密钥'),onChanged:(value)=>setState(()=>_clearSecret=value??false)),
      ],
      SwitchListTile.adaptive(value:_enabled,contentPadding:EdgeInsets.zero,title:const Text('启用此渠道'),onChanged:(value)=>setState(()=>_enabled=value)),
    ]),
    actions:[TextButton(onPressed:()=>Navigator.of(context).pop(),child:const Text('取消')),FilledButton(onPressed:_submit,child:Text(widget.submitLabel))],
  );
  void _submit(){if(!_formKey.currentState!.validate())return;Navigator.of(context).pop(NotificationSubscriptionFormData(channel:_channel,targetValue:_targetController.text.trim(),enabled:_enabled,secret:_secretController.text.trim(),clearSecret:_clearSecret));}
}