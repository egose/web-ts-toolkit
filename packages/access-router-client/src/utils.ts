export function replaceItemById<T extends { _id: string }>(items: T[], targetItem: T, options?: { merge: boolean }) {
  const { merge = true } = options ?? {};

  return items.map((item) => {
    if (item._id === targetItem._id) {
      return merge ? { ...item, ...targetItem } : targetItem;
    }

    return item;
  });
}

export function removeItemById<T extends { _id: string }>(items: T[], targetItem: T) {
  return items.filter((item) => {
    return item._id !== targetItem._id;
  });
}
