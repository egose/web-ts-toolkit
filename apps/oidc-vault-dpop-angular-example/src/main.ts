import { bootstrapApplication } from '@angular/platform-browser';
import 'zone.js';

import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent).catch((error: unknown) => {
  console.error(error);
});
