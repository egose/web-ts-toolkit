import { Projection, Populate, Include, PopulateAccess, Task } from './base';

export interface PublicReadArgs {
  select?: Projection;
  populate?: Populate[] | string;
  include?: Include | Include[];
  tasks?: Task | Task[];
}

export interface PublicReadOptions {
  skim?: boolean;
  populateAccess?: PopulateAccess;
  lean?: boolean;
  includePermissions?: boolean;
  /** Retry an authorized read miss with list access (default true); requires list operation access. Forbidden/BadRequest never retry. */
  tryList?: boolean;
}
