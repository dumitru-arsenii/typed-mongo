import { ObjectId } from "mongodb";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
} from "vitest";
import { z } from "zod";

import {
  createMongoEntity,
  entityManager,
  type EntityType,
  mongoId,
  timestamps,
} from "../src";
import { clearMongo, startMongo, stopMongo } from "./helpers";

const postsEntity = createMongoEntity({
  collection: "relation_posts",
  schema: z.object({
    userId: mongoId(),
    title: z.string().min(1),
    status: z.enum(["draft", "published"]).default("draft"),
    ...timestamps(),
  }),
});

const usersEntity = createMongoEntity({
  collection: "relation_users",
  schema: z.object({
    email: z.string().email(),
    name: z.string().min(1),
    ...timestamps(),
  }),
  relations: ({ hasMany }) => ({
    posts: hasMany(() => postsEntity, {
      localKey: "_id",
      foreignKey: "userId",
    }),
  }),
});

const commentsEntity = createMongoEntity({
  collection: "relation_comments",
  schema: z.object({
    userId: mongoId(),
    body: z.string().min(1),
    ...timestamps(),
  }),
  relations: ({ belongsTo }) => ({
    user: belongsTo(() => usersEntity, {
      localKey: "userId",
      foreignKey: "_id",
    }),
  }),
});

describe("relations", () => {
  beforeAll(async () => {
    await startMongo();
  });

  beforeEach(async () => {
    await clearMongo();
  });

  afterAll(async () => {
    await stopMongo();
  });

  it("eager loads hasMany relations from repositories", async () => {
    const users = entityManager.repo(usersEntity);
    const user = await users.create({
      email: "jane@example.com",
      name: "Jane",
    });
    await entityManager.repo(postsEntity).insertMany([
      { userId: user._id, title: "First", status: "draft" },
      { userId: user._id, title: "Second", status: "published" },
    ]);

    const loaded = await users.withPosts.findById(user._id);

    expectTypeOf(loaded).toEqualTypeOf<
      | (EntityType<typeof usersEntity> & {
          posts: EntityType<typeof postsEntity>[];
        })
      | null
    >();
    expect(loaded?.posts).toHaveLength(2);
    expect(loaded?.posts.map((post) => post.title).sort()).toEqual([
      "First",
      "Second",
    ]);
  });

  it("eager loads belongsTo relations from repositories", async () => {
    const user = await entityManager.repo(usersEntity).create({
      email: "jane@example.com",
      name: "Jane",
    });
    const comment = await entityManager.repo(commentsEntity).create({
      userId: user._id,
      body: "Nice",
    });

    const loaded = await entityManager
      .repo(commentsEntity)
      .withUser.findById(comment._id);

    expect(loaded?.user?.email).toBe("jane@example.com");
  });

  it("scopes relation repositories and lets relation values win", async () => {
    const users = entityManager.repo(usersEntity);
    const user = await users.create({
      email: "jane@example.com",
      name: "Jane",
    });
    const anotherUserId = new ObjectId();

    const created = await users.posts(user._id).create({
      userId: anotherUserId,
      title: "Scoped create",
      status: "draft",
    } as any);

    expect(created.userId).toEqual(user._id);

    await users.posts(user._id).create({
      title: "Published",
      status: "published",
    });

    const draftPosts = await users.posts(user._id).findMany({
      userId: anotherUserId,
      status: "draft",
    } as any);

    expect(draftPosts).toHaveLength(1);
    expect(draftPosts[0]!.userId).toEqual(user._id);

    await users.posts(user._id).updateMany(
      {
        status: "draft",
      },
      {
        status: "published",
      },
    );

    await expect(users.posts(user._id).count({ status: "draft" })).resolves.toBe(0);
    await expect(users.posts(user._id).deleteMany({ status: "published" })).resolves.toBe(
      2,
    );
  });

  it("loads and queries relations from ActiveRecord instances", async () => {
    const User = entityManager.active(usersEntity);
    const user = await User.create({
      email: "jane@example.com",
      name: "Jane",
    });

    await user.posts().create({
      title: "From ActiveRecord",
      status: "draft",
    });
    await user.loadPosts();

    expect(user.related.posts).toHaveLength(1);
    expect(user.related.posts[0]!.userId).toEqual(user.data._id);

    const [post] = await user.posts().findMany({ status: "draft" });
    expect(post!.title).toBe("From ActiveRecord");
  });

  it("loads belongsTo relations from ActiveRecord instances", async () => {
    const user = await entityManager.repo(usersEntity).create({
      email: "jane@example.com",
      name: "Jane",
    });
    const Comment = entityManager.active(commentsEntity);
    const comment = await Comment.create({
      userId: user._id,
      body: "Nice",
    });

    await comment.loadUser();

    expect(comment.related.user?.email).toBe("jane@example.com");
    await expect(comment.user().findOne({})).resolves.toMatchObject({
      email: "jane@example.com",
    });
  });
});
