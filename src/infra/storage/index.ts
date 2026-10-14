import { env } from "../../config/env.js";
import { LocalDiskStorage, type StorageDriver } from "./storage-driver.js";

export const storage: StorageDriver = new LocalDiskStorage(env.mediaDir);
