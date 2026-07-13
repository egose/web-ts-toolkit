import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@egose/shadcn-theme/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@egose/shadcn-theme/components/ui/card';
import { Checkbox } from '@egose/shadcn-theme/components/ui/checkbox';
import { Input } from '@egose/shadcn-theme/components/ui/input';
import { Label } from '@egose/shadcn-theme/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@egose/shadcn-theme/components/ui/select';
import type { Category } from '../types';

const todoSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  categoryId: z.string().optional(),
  completed: z.boolean(),
});

export type TodoFormValues = z.infer<typeof todoSchema>;

interface TodoFormProps {
  categories: Category[];
  initialValues?: Partial<TodoFormValues> & { _id?: string };
  submitLabel: string;
  onSubmit: (values: TodoFormValues) => void;
  onCancel?: () => void;
}

const formFieldClass = 'grid gap-2';
const errorTextClass = 'text-sm text-red-500';

const NONE_CATEGORY = '__none__';

export function TodoForm({ categories, initialValues, submitLabel, onSubmit, onCancel }: TodoFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<TodoFormValues>({
    resolver: zodResolver(todoSchema),
    defaultValues: { title: '', categoryId: '', completed: false, ...initialValues },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{initialValues?._id ? 'Edit todo' : 'New todo'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit(onSubmit)}>
          <div className={formFieldClass}>
            <Label htmlFor="title">Title</Label>
            <Input id="title" placeholder="What needs to be done?" {...register('title')} />
            {errors.title && <span className={errorTextClass}>{errors.title.message}</span>}
          </div>

          <div className={formFieldClass}>
            <Label htmlFor="categoryId">Category</Label>
            <Controller
              control={control}
              name="categoryId"
              render={({ field }) => (
                <Select
                  value={field.value ?? NONE_CATEGORY}
                  onValueChange={(v) => field.onChange(v === NONE_CATEGORY ? '' : v)}
                >
                  <SelectTrigger id="categoryId">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_CATEGORY}>None</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category._id} value={category._id as string}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="flex items-center gap-2">
            <Controller
              control={control}
              name="completed"
              render={({ field }) => (
                <Checkbox
                  id="completed"
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
              )}
            />
            <Label htmlFor="completed">Completed</Label>
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {submitLabel}
            </Button>
            {onCancel && (
              <Button type="button" variant="secondary" onClick={onCancel}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
