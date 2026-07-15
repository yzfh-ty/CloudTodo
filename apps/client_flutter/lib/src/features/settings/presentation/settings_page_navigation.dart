part of 'settings_page.dart';

enum SettingsSection { profile, sync, notifications, preferences }

extension _SettingsPageNavigation on _SettingsPageState {
  Widget _buildSettingsScaffold({
    required bool isMobile,
    required Widget content,
  }) {
    if (isMobile) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          DropdownButtonFormField<SettingsSection>(
            initialValue: _selectedSettingsSection,
            decoration: const InputDecoration(labelText: '设置分类'),
            items: SettingsSection.values
                .map(
                  (section) => DropdownMenuItem(
                    value: section,
                    child: Text(settingsSectionLabel(section)),
                  ),
                )
                .toList(growable: false),
            onChanged: (value) {
              if (value != null) {
                _selectSettingsSection(value);
              }
            },
          ),
          const SizedBox(height: 12),
          Expanded(child: content),
        ],
      );
    }

    return content;
  }
}

String settingsSectionLabel(SettingsSection section) {
  return switch (section) {
    SettingsSection.profile => '账户资料',
    SettingsSection.sync => '同步设备',
    SettingsSection.notifications => '通知方式',
    SettingsSection.preferences => '外观连接',
  };
}
