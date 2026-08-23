# Homebridge Blueair Mini Restful

[![npm version](https://badgen.net/npm/v/homebridge-blueair-mini-restful)](https://www.npmjs.com/package/homebridge-blueair-mini-restful)
[![npm downloads](https://badgen.net/npm/dt/homebridge-blueair-mini-restful?label=downloads)](https://www.npmjs.com/package/homebridge-blueair-mini-restful)

A Homebridge plugin for cloud-connected Blueair air purifiers, with dedicated support for the Blueair 229 / Mini Restful device. It exposes the purifier and supported controls to Apple Home.

> This community plugin is not affiliated with or endorsed by Blueair or Unilever. It uses Blueair's cloud services, so an internet connection and a working Blueair account are required.

## Mini Restful support

The Blueair 229 / Mini Restful is detected from the device capabilities returned by the Blueair API. For this device, the plugin provides:

- Power control
- Three fan speeds, mapped to approximately 33%, 66%, and 100% in HomeKit
- A separate night-light service with on/off and brightness control
- Manual mode only when the device does not report automatic-mode support
- Filter status and physical-control lock when those values are reported by the device

Other services, including air-quality, temperature, LED, night mode, and GermShield controls, are only useful when the connected device reports the corresponding capability. The plugin has been specifically maintained and tested for Mini Restful functionality; other inherited Blueair model support is not guaranteed by this fork.

## Requirements

- Homebridge 1.8 or later (Homebridge 2 beta is also accepted by the package)
- Node.js 20.18, 22.10, or 24, or a compatible newer release in one of those major versions
- A Blueair account with the purifier already added in the Blueair app
- Internet access from Homebridge to Blueair's authentication and device-control services

## Installation

### Homebridge UI

1. Open **Plugins** in the Homebridge UI.
2. Search for **Homebridge BlueAir Mini Restful** or `homebridge-blueair-mini-restful`.
3. Confirm the package name is exactly `homebridge-blueair-mini-restful`, then install it.
4. Open the plugin settings and run device discovery.

### Command line

```sh
sudo npm install -g homebridge-blueair-mini-restful
```

To upgrade an existing installation:

```sh
sudo npm install -g homebridge-blueair-mini-restful@latest
```

Restart Homebridge after installing or upgrading.

## Configuration

The Homebridge UI is the recommended configuration method. Enter your Blueair username, password, and account region, then use discovery to populate the account UUID and devices.

Important settings:

| Setting | Purpose |
| --- | --- |
| Region | Region used to authenticate the Blueair account. |
| Cloud Region Override | Optional device-control region. Leave it unset unless authentication succeeds but devices cannot be loaded, or your account and device use different Blueair regions. |
| Polling Interval | Time between cloud updates, in milliseconds. The default and enforced minimum are 60,000 ms (60 seconds) to reduce API rate limiting. |
| Verbose Logging | Adds detailed plugin logs for troubleshooting. Disable it during normal operation. |
| Filter Change Level | Filter-usage percentage at which HomeKit reports that the filter should be changed. The default is 90%. |

The per-device toggles create optional HomeKit services. Enable only services supported by your purifier:

- LED
- Air Quality Sensor
- Temperature Sensor
- GermShield
- Night Mode

The Mini Restful night light is detected automatically and does not depend on the optional Night Mode toggle. These are separate controls.

## Rate limits and retries

Blueair may return HTTP 429 when its cloud API receives too many requests. The plugin:

- Enforces a polling interval of at least 60 seconds
- Honors Blueair and Gigya `Retry-After` responses
- Uses exponential backoff instead of immediate repeated requests
- Automatically retries initial device-state loading when it is rate-limited
- Applies timeouts and backoff to authentication requests

If Homebridge logs show rate limiting, leave the plugin running so the scheduled retry can complete. Avoid repeatedly restarting Homebridge or running discovery, because each attempt creates more cloud requests.

## Troubleshooting

### The plugin does not appear in Homebridge

Confirm that `homebridge-blueair-mini-restful` is installed, rather than the original upstream package, and restart Homebridge. The installed version is shown in the Homebridge Plugins page and can also be checked with:

```sh
npm list -g homebridge-blueair-mini-restful --depth=0
```

### Authentication works but no devices appear

- Confirm that the purifier is online and visible in the Blueair app.
- Confirm that discovery saved the account UUID and device entry.
- Check that the selected account Region is correct.
- If necessary, try the Cloud Region Override for the region hosting the device-control service.
- Enable Verbose Logging temporarily and review the Homebridge log.

### HomeKit shows only three useful fan levels

This is expected for Mini Restful. HomeKit's percentage control is translated to the device's three supported running speeds.

### Reporting a problem

Open an [issue](https://github.com/SobriTech/homebridge-blueair-purifier/issues) and include:

- Plugin, Homebridge, and Node.js versions
- The device name/model reported by Blueair
- Relevant Homebridge log lines with Verbose Logging enabled
- A description of the expected and observed behavior

Remove usernames, passwords, account identifiers, tokens, and serial numbers before posting logs.

## Releases and changes

- [GitHub Releases](https://github.com/SobriTech/homebridge-blueair-purifier/releases)
- [Changelog](CHANGELOG.md)
- [npm package](https://www.npmjs.com/package/homebridge-blueair-mini-restful)

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Credits and license

This project is a fork of [`kovapatrik/homebridge-blueair-purifier`](https://github.com/kovapatrik/homebridge-blueair-purifier), with Mini Restful support and reliability fixes maintained by SobriTech. It also builds on earlier Blueair AWS API work credited by the upstream project.

Licensed under the [Apache License 2.0](LICENSE).

Apple and HomeKit are trademarks of Apple Inc. Blueair is a trademark of Unilever.
