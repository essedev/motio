import { Config } from "@remotion/cli/config";

Config.setEntryPoint("./app/entry.tsx");
Config.setPublicDir("./assets-public");
Config.setDotEnvLocation("fixture.env");
Config.setVideoImageFormat("png");
Config.setConcurrency(2);
Config.setKeyboardShortcutsEnabled(false);
Config.overrideWebpackConfig((current) => ({ ...current, devtool: false }));
