import { ApplicationRef, Injectable } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { concat, interval } from 'rxjs';
import { first, startWith } from 'rxjs/operators';

/* The `AppUpdateService` is responsible for checking for app updates using a
service worker and automatically applying updates. */
@UntilDestroy()
@Injectable({
  providedIn: 'root',
})
export class AppUpdateService {
  constructor(
    private readonly _swUpdate: SwUpdate,
    appRef: ApplicationRef,
  ) {
    console.log('%c Update service is running...', 'color: green; font-weight: bold;');

    if (this._swUpdate?.isEnabled) {
      console.log('%c Service worker enabled', 'color: orange; font-weight: bold;');

      // Allow the app to stabilize first, before starting polling for updates.
      const appIsStable$ = appRef?.isStable?.pipe(first((isStable) => isStable === true));
      const everySixHours$ = interval(1000 * 60 * 60 * 6).pipe(startWith(0));
      const everySixHoursOnceAppIsStable$ = concat(appIsStable$, everySixHours$);

      everySixHoursOnceAppIsStable$.pipe(untilDestroyed(this)).subscribe(async () => {
        try {
          console.log('%c Checking for app updates...', 'color: yellow; font-weight: bold;');
          const updateFound = await this._swUpdate.checkForUpdate();
          console.log('%c Finish checking for updates...', 'color: yellow; font-weight: bold;');
          console.log(updateFound ? '%c A new version is available.' : '%c Already on the latest version.', 'color: white; font-weight: bold;');
        } catch (err) {
          console.error('Failed to check for updates:', err);
        }
      });
    } else console.log('%c No service worker allow', 'color: red; font-weight: bold;');
  }

  subscribeForUpdates(): void {
    this._swUpdate?.versionUpdates?.pipe(untilDestroyed(this)).subscribe((evt) => {
      switch (evt.type) {
        case 'VERSION_DETECTED':
          console.log(`%c Downloading new app version: ${evt.version.hash}`, 'color: green;');
          break;
        case 'VERSION_READY':
          console.log(`Current app version: ${evt.currentVersion.hash}`);
          console.log(`%c New app version ready for use: ${evt.latestVersion.hash}`, 'color: cyan; font-weight: bold;');
          this._activateUpdate();
          break;
        case 'VERSION_INSTALLATION_FAILED':
          console.log(`%c Failed to install app version '${evt.version.hash}': ${evt.error}`, 'color: red; font-weight: bold;');
          break;
      }
    });
  }

  private _activateUpdate() {
    console.log('%c Activating update and reloading...', 'color: blue; font-weight: bold;');
    this._swUpdate.activateUpdate().then(() => {
      console.log('%c Update activated, reloading page...', 'color: green; font-weight: bold;');
      document.location.reload();
    });
  }
}
