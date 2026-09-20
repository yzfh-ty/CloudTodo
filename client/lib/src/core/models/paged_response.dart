class PagedResponse<T> {
  const PagedResponse({
    required this.items,
    required this.nextCursor,
    required this.hasMore,
  });

  final List<T> items;
  final String? nextCursor;
  final bool hasMore;

  // Kept as derived compatibility values for the existing presentation layer.
  int get page => 1;
  int get pageSize => items.length;
  int get total => items.length;

  factory PagedResponse.fromJson(
    Map<String, dynamic> json,
    T Function(Map<String, dynamic> item) parser,
  ) {
    final rawItems = json['items'] as List<dynamic>? ?? const [];
    return PagedResponse<T>(
      items: rawItems
          .whereType<Map<String, dynamic>>()
          .map(parser)
          .toList(growable: false),
      nextCursor: json['next_cursor'] as String?,
      hasMore: json['has_more'] as bool? ?? false,
    );
  }
}
