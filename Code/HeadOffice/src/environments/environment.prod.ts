import { env } from './.env';

export const environment = {
  production: true,
  version: env['npm_package_version'],
  defaultLanguage: 'de-DE',
  supportedLanguages: ['de-DE', 'en-US'],
  apiUrl: 'https://api.akzente.group/api/v1', // Replace with your actual production API URL
  settings: {
    auth: {
      // keys to store tokens at local storage
      accessTokenKey: 'DoPS3ZrQjM',
      refreshTokenKey: 'nmlP8PW2nb',
      tokenExpiresKey: 'tE5pK9yN1m',
    },
  },
  mapboxToken: 'pk.eyJ1IjoiYWt6ZW50ZS1yZXRhaWxzZXJ2aWNlIiwiYSI6ImNtaDF3Ym0yNzA3ajMyaXM5NWhpY2ZwdjYifQ.3Tc-Cfh5eB2dRUfY4lQ6qw',
};
