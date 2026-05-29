import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { entityManager } from "../src";
import { clearMongo, startMongo, stopMongo, UserEntity } from "./helpers";

describe("active record", () => {
  beforeAll(async () => {
    await startMongo();
  });

  beforeEach(async () => {
    await clearMongo();
  });

  afterAll(async () => {
    await stopMongo();
  });

  it("build does not persist immediately", async () => {
    const User = entityManager.active(UserEntity);
    const user = User.build({
      email: "john@example.com",
      name: "John",
    });

    expect(user.isNew()).toBe(true);
    await expect(entityManager.repo(UserEntity).count()).resolves.toBe(0);
  });

  it("create persists immediately", async () => {
    const User = entityManager.active(UserEntity);
    const user = await User.create({
      email: "john@example.com",
      name: "John",
    });

    expect(user.isNew()).toBe(false);
    expect(user.isDirty()).toBe(false);
    await expect(entityManager.repo(UserEntity).count()).resolves.toBe(1);
  });

  it("save creates and updates documents", async () => {
    const User = entityManager.active(UserEntity);
    const user = User.build({
      email: "john@example.com",
      name: "John",
    });

    await user.save();
    expect(user.isNew()).toBe(false);

    user.data.name = "Johnny";
    expect(user.isDirty()).toBe(true);

    await user.save();

    expect(user.isDirty()).toBe(false);
    await expect(User.findById(user.data._id)).resolves.toMatchObject({
      data: {
        name: "Johnny",
      },
    });
  });

  it("reload refreshes local data", async () => {
    const User = entityManager.active(UserEntity);
    const user = await User.create({
      email: "john@example.com",
      name: "John",
    });

    await entityManager.repo(UserEntity).updateById(user.data._id, {
      name: "Johnny",
    });
    await user.reload();

    expect(user.data.name).toBe("Johnny");
  });

  it("delete removes the document", async () => {
    const User = entityManager.active(UserEntity);
    const user = await User.create({
      email: "john@example.com",
      name: "John",
    });

    await expect(user.delete()).resolves.toBe(true);
    await expect(entityManager.repo(UserEntity).count()).resolves.toBe(0);
  });
});
