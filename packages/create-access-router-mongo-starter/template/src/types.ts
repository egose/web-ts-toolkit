export interface Category {
  _id?: string;
  name: string;
  color: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Todo {
  _id?: string;
  title: string;
  completed: boolean;
  categoryId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
