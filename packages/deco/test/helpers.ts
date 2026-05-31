import 'reflect-metadata';

export function applyMethodDecorator(decorator: MethodDecorator, target: object, methodName: string) {
  const descriptor = Object.getOwnPropertyDescriptor(target, methodName)!;
  decorator(target, methodName, descriptor);
}

export function applyParameterDecorator(
  decorator: ParameterDecorator,
  target: object,
  methodName: string,
  index: number,
) {
  decorator(target, methodName, index);
}
