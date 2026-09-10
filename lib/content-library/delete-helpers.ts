export async function deleteContentLibraryRowsAfterLinkedAssets(params: {
  deleteLinkedAssets: () => Promise<void>;
  deleteItems: () => PromiseLike<{ error: { message?: string } | null }>;
  onDeleteItemsError?: (error: { message?: string } | null) => void;
}) {
  await params.deleteLinkedAssets();

  const { error } = await params.deleteItems();
  if (error) {
    params.onDeleteItemsError?.(error);
    throw new Error("删除内容索引失败");
  }
}
