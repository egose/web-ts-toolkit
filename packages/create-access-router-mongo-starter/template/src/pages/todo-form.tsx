import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { todoFormSchema } from '../shared/entity-schemas';
import type { Category, TodoFormInput } from '../types';

export type TodoFormValues = TodoFormInput;

interface TodoFormProps {
  categories: Category[];
  disabled?: boolean;
  initialValues?: Partial<TodoFormValues> & { _id?: string };
  submitLabel: string;
  onSubmit: (values: TodoFormValues) => Promise<boolean>;
  onCancel?: () => void;
}

const formFieldClass = 'grid gap-2';
const errorTextClass = 'text-sm text-red-500';
const descriptionTextClass = 'text-sm text-muted-foreground';

const NONE_CATEGORY = '__none__';
const titleDescriptionId = 'todo-title-description';
const titleErrorId = 'todo-title-error';
const categoryDescriptionId = 'todo-category-description';

export function TodoForm({
  categories,
  disabled = false,
  initialValues,
  submitLabel,
  onSubmit,
  onCancel,
}: TodoFormProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TodoFormValues>({
    resolver: zodResolver(todoFormSchema),
    defaultValues: { title: '', categoryId: '', completed: false, ...initialValues },
  });
  const titleRegistration = register('title');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{initialValues?._id ? 'Edit todo' : 'New todo'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={handleSubmit(async (values) => {
            const completed = await onSubmit(values);
            if (completed && !initialValues?._id) reset();
          })}
        >
          <div className={formFieldClass}>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="What needs to be done?"
              disabled={disabled}
              aria-describedby={errors.title ? `${titleDescriptionId} ${titleErrorId}` : titleDescriptionId}
              aria-invalid={errors.title ? 'true' : 'false'}
              autoFocus={Boolean(initialValues?._id)}
              {...titleRegistration}
            />
            <span id={titleDescriptionId} className={descriptionTextClass}>
              Enter 1 to 200 characters.
            </span>
            {errors.title && (
              <span id={titleErrorId} className={errorTextClass}>
                {errors.title.message}
              </span>
            )}
          </div>

          <div className={formFieldClass}>
            <Label htmlFor="categoryId">Category</Label>
            <Controller
              control={control}
              name="categoryId"
              render={({ field }) => (
                <Select
                  disabled={disabled}
                  value={field.value ?? NONE_CATEGORY}
                  onValueChange={(v) => field.onChange(v === NONE_CATEGORY ? '' : v)}
                >
                  <SelectTrigger id="categoryId" aria-describedby={categoryDescriptionId}>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE_CATEGORY}>None</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category._id} value={category._id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <span id={categoryDescriptionId} className={descriptionTextClass}>
              Optional category for grouping this todo.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Controller
              control={control}
              name="completed"
              render={({ field }) => (
                <Checkbox
                  id="completed"
                  checked={field.value}
                  disabled={disabled}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
              )}
            />
            <Label htmlFor="completed">Completed</Label>
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" variant="primary" disabled={disabled || isSubmitting}>
              {submitLabel}
            </Button>
            {onCancel && (
              <Button type="button" variant="secondary" disabled={disabled} onClick={onCancel}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
