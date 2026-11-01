# Changelog

## 1.1.1 (2026-11-01)

- Persist removal of stale cached Mini Restful Lightbulb services so the generic unresponsive `Light` tile does not return after restarting Homebridge.

## 1.1.0 (2026-11-01)

- Selectively port upstream compatibility fixes, including device SKU typing and model-specific automatic-mode handling.
- Classify SKU `113836` and devices exposing `nlstepless` as Mini Restful while preserving fan values `11`/`51`/`91` and night-light behavior.
- Remove stale cached HomeKit light services from Mini Restful accessories while preserving the Night Light and an explicitly enabled LED.
- Persist custom-UI settings on Save and clean empty objects from device arrays.
- Treat Blueair HTTP 229 and 429 responses as rate limits with `Retry-After` support and slower exponential backoff.
- Correct PM2.5 change handling and update air-quality, filter, and temperature characteristics through their proper HomeKit services.
- Clamp filter life to the HomeKit 0–100 range.
- Remove sensitive environment, configuration, username, and authentication-payload logging.
- Add restricted Blue 40/SP4i telemetry fallback when normal data lacks AQ readings and the device advertises AQ sensors.

## 1.0.2 (2026-08-23)

- Add request timeouts and exponential retry backoff to Gigya authentication.
- Honor Blueair API `Retry-After` values longer than 60 seconds.

## 1.0.1 (2026-08-22)

- Increase the default and minimum polling interval to 60 seconds.
- Handle BlueAir API HTTP 429 responses and honor the `Retry-After` header.
- Retry failed API requests with exponential backoff without deadlocking the request mutex.
- Automatically retry initial device-state loading after rate limiting.
- Update Homebridge settings and installation documentation.

## 1.0.0 (2026-07-12)

- Add Blueair Mini Restful device detection and three-speed fan mapping.
- Add HomeKit night-light on/off and brightness controls.
- Support devices without automatic mode by exposing manual mode only.
- Publish the plugin as `homebridge-blueair-mini-restful`.

# v1.1.0
## [1.1.1](https://github.com/kovapatrik/homebridge-blueair-purifier/compare/v1.1.0...v1.1.1) (2026-06-30)


### Bug Fixes

* support split Blueair cloud regions ([493d6dd](https://github.com/kovapatrik/homebridge-blueair-purifier/commit/493d6dd77191b4a72bcdd99672941125ae382ed0))
* support split Blueair cloud regions ([84475d0](https://github.com/kovapatrik/homebridge-blueair-purifier/commit/84475d0455ef004661a2660a766c1b2383bed10b))

## 2026-01-07
- fix: correct handling of state/sensor updates, so the states of the accessory in the Home app refreshes correctly
- fix: correct mutex usage
- fix: supports Node.js v24 (fixes #26)
- chore: outdated dependencies

# v1.0.11
## 2024-07-21
- fix: added Canada to the custom UI
