part of 'todo_page.dart';

extension _TodoPageToolbar on _TodoPageState {
  Widget _buildFocusedToolbar(bool isMobile) {
    final theme = Theme.of(context);
    final quickInput = TextField(
      controller: _createController,
      decoration: InputDecoration(
        hintText: '快速添加待办',
        prefixIcon: const Icon(Icons.add_task_rounded),
        suffixIcon: isMobile
            ? IconButton(
                tooltip: '添加',
                onPressed: _controller.isSubmitting ? null : _createTodo,
                icon: const Icon(Icons.arrow_upward_rounded),
              )
            : null,
      ),
      onSubmitted: (_) => _createTodo(),
    );
    final statusFilters = Wrap(
      spacing: 6,
      runSpacing: 6,
      children: [
        _StatusFilterChip(
          label: '待办',
          compact: isMobile,
          selected: _controller.statusFilter == 'pending',
          onSelected: () => _controller.setStatusFilter('pending'),
        ),
        _StatusFilterChip(
          label: '已完成',
          compact: isMobile,
          selected: _controller.statusFilter == 'completed',
          onSelected: () => _controller.setStatusFilter('completed'),
        ),
        _StatusFilterChip(
          label: '已归档',
          compact: isMobile,
          selected: _controller.statusFilter == 'archived',
          onSelected: () => _controller.setStatusFilter('archived'),
        ),
        _StatusFilterChip(
          label: '全部',
          compact: isMobile,
          selected: _controller.statusFilter == null,
          onSelected: () => _controller.setStatusFilter(null),
        ),
      ],
    );
    final searchInput = TextField(
      controller: _searchController,
      decoration: const InputDecoration(
        hintText: '搜索待办',
        prefixIcon: Icon(Icons.search_rounded),
      ),
      onSubmitted: _controller.setKeyword,
    );
    final filterButton = IconButton.outlined(
      tooltip: _showAdvancedFilters ? '收起清单与标签' : '清单与标签',
      onPressed: _toggleAdvancedFilters,
      icon: Icon(
        _showAdvancedFilters
            ? Icons.filter_list_off_rounded
            : Icons.tune_rounded,
      ),
    );
    final refreshButton = IconButton(
      tooltip: '刷新',
      onPressed: _controller.isLoading ? null : _controller.refresh,
      icon: const Icon(Icons.refresh_rounded),
    );

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: isMobile
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                quickInput,
                const SizedBox(height: 8),
                statusFilters,
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(child: searchInput),
                    const SizedBox(width: 6),
                    filterButton,
                    refreshButton,
                  ],
                ),
              ],
            )
          : Column(
              children: [
                Row(
                  children: [
                    Expanded(child: quickInput),
                    const SizedBox(width: 10),
                    FilledButton.icon(
                      onPressed: _controller.isSubmitting ? null : _createTodo,
                      icon: const Icon(Icons.arrow_upward_rounded),
                      label: Text(_controller.isSubmitting ? '添加中' : '添加'),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    statusFilters,
                    const SizedBox(width: 10),
                    Expanded(child: searchInput),
                    const SizedBox(width: 6),
                    filterButton,
                    refreshButton,
                  ],
                ),
              ],
            ),
    );
  }
}
