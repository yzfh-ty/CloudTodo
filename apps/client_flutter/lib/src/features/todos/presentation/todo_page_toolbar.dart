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
          selected: _controller.statusFilter == 'pending',
          onSelected: () => _controller.setStatusFilter('pending'),
        ),
        _StatusFilterChip(
          label: '已完成',
          selected: _controller.statusFilter == 'completed',
          onSelected: () => _controller.setStatusFilter('completed'),
        ),
        _StatusFilterChip(
          label: '已归档',
          selected: _controller.statusFilter == 'archived',
          onSelected: () => _controller.setStatusFilter('archived'),
        ),
        _StatusFilterChip(
          label: '全部',
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
      tooltip: _showAdvancedFilters ? '收起高级筛选' : '高级筛选',
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
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: statusFilters,
                ),
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

  Widget _buildQuickAddControls(bool isMobile) {
    final input = TextField(
      controller: _createController,
      decoration: const InputDecoration(hintText: '输入一条新的任务标题'),
      onSubmitted: (_) => _createTodo(),
    );
    final addButton = FilledButton(
      onPressed: _controller.isSubmitting ? null : _createTodo,
      child: Text(_controller.isSubmitting ? '提交中...' : '添加'),
    );
    final formButton = OutlinedButton(
      onPressed: _controller.isSubmitting ? null : _openCreateDialog,
      child: const Text('完整表单'),
    );

    if (isMobile) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          input,
          const SizedBox(height: 12),
          Wrap(
            spacing: 12,
            runSpacing: 8,
            children: [addButton, formButton],
          ),
        ],
      );
    }

    return Row(
      children: [
        Expanded(child: input),
        const SizedBox(width: 12),
        addButton,
        const SizedBox(width: 12),
        formButton,
      ],
    );
  }

  Widget _buildSearchControls(bool isMobile) {
    final input = TextField(
      controller: _searchController,
      decoration: const InputDecoration(
        hintText: '按标题或描述搜索',
        prefixIcon: Icon(Icons.search_rounded),
      ),
      onSubmitted: _controller.setKeyword,
    );
    final button = FilledButton.tonal(
      onPressed: () => _controller.setKeyword(_searchController.text),
      child: const Text('筛选'),
    );

    if (isMobile) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          input,
          const SizedBox(height: 12),
          Align(alignment: Alignment.centerLeft, child: button),
        ],
      );
    }

    return Row(
      children: [
        Expanded(child: input),
        const SizedBox(width: 12),
        button,
      ],
    );
  }
}
