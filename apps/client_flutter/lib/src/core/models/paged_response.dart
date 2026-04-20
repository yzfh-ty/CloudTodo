class PagedResponse<T> {
  const PagedResponse({
    required this.items,
    required this.page,
    required this.pageSize,
    required this.total,
    required this.hasMore,
  });

  final List<T> items;
  final int page;
  final int pageSize;
  final int total;
  final bool hasMore;

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
      page: json['page'] as int? ?? 1,
      pageSize: json['page_size'] as int? ?? 20,
      total: json['total'] as int? ?? 0,
      hasMore: json['has_more'] as bool? ?? false,
    );
  }
}
