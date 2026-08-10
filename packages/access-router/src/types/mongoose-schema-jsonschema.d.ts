declare module 'mongoose-schema-jsonschema' {
  import type mongoose from 'mongoose';
  const mschema2Jsonschema: (m: typeof mongoose) => void;
  export default mschema2Jsonschema;
}
