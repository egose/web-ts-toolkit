// The upstream pure compiler entry avoids the require.extensions hooks in the package's default Node entry.
declare module 'handlebars/dist/cjs/handlebars.js' {
  import Handlebars from 'handlebars';
  export default Handlebars;
}
