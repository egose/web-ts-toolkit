import * as root from '@web-ts-toolkit/access-router';
import * as advanced from '@web-ts-toolkit/access-router/advanced';
import * as processors from '@web-ts-toolkit/access-router/processors';
import check from './arts04-export-assertions.cjs';

check(root, advanced, processors);
process.stdout.write('ARTS04-EXPORTS-PASS\n');
