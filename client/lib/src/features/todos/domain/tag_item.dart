class TagItem {
  const TagItem({
    required this.id,
    required this.name,
    this.color,
    this.version = 1,
  });

  final String id;
  final String name;
  final String? color;
  final int version;

  factory TagItem.fromJson(Map<String, dynamic> json) {
    return TagItem(
      id: json['id'] as String,
      name: json['name'] as String? ?? '',
      color: json['color'] as String?,
      version: json['version'] as int? ?? 1,
    );
  }
}
