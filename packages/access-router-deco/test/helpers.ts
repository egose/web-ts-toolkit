import 'reflect-metadata';

export function applyMethodDecorator(decorator: MethodDecorator, target: object, methodName: string | symbol) {
  const descriptor = Object.getOwnPropertyDescriptor(target, methodName)!;
  decorator(target, methodName as string, descriptor as any);
}

export function applyParameterDecorator(
  decorator: ParameterDecorator,
  target: object,
  methodName: string | symbol,
  index: number,
) {
  decorator(target, methodName as string, index);
}

export function applyMethodDecoratorSym(decorator: MethodDecorator, target: object, methodKey: string | symbol) {
  const descriptor = Object.getOwnPropertyDescriptor(target, methodKey)!;
  (decorator as any)(target, methodKey, descriptor);
}
