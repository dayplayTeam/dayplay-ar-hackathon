import { registerRootComponent } from "expo";

import App from "./App";

// registerRootComponent ensures the environment is set up consistently across
// Expo Go, dev clients, and native builds.
registerRootComponent(App);
