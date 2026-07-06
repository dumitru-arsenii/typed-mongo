import { ObjectId } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  createMongoEntity,
  entityManager,
  mongoId,
  timestamps,
  type EntityType,
} from "../src";
import { clearMongo, startMongo, stopMongo } from "./helpers";

const SectionArtifactSchema = z.object({
  kind: z.literal("section"),
  pageId: mongoId(),
  sectionKey: z.string(),
  order: z.number(),
  props: z.record(z.unknown()),
  ...timestamps(),
});

const SeoArtifactSchema = z.object({
  kind: z.literal("seo"),
  pageId: mongoId(),
  title: z.string(),
  description: z.string().optional(),
  ...timestamps(),
});

const PageArtifactsEntity = createMongoEntity({
  collection: "page_artifacts",
  schema: z.discriminatedUnion("kind", [SectionArtifactSchema, SeoArtifactSchema]),
  indexes: [
    {
      keys: {
        kind: 1,
        pageId: 1,
      },
    },
  ],
});

describe("zod discriminated union entities", () => {
  beforeAll(async () => {
    await startMongo();
  });

  beforeEach(async () => {
    await clearMongo();
  });

  afterAll(async () => {
    await stopMongo();
  });

  it("creates variants from zod discriminated unions", () => {
    expect(PageArtifactsEntity.variants.section.collection).toBe("page_artifacts");
    expect(PageArtifactsEntity.variants.section.discriminator).toBe("kind");
    expect(PageArtifactsEntity.variants.section.discriminatorValue).toBe("section");

    expect(PageArtifactsEntity.variants.seo.collection).toBe("page_artifacts");
    expect(PageArtifactsEntity.variants.seo.discriminator).toBe("kind");
    expect(PageArtifactsEntity.variants.seo.discriminatorValue).toBe("seo");
  });

  it("lets the base repo create all variants", async () => {
    const pageId = new ObjectId();
    const repo = entityManager.repo(PageArtifactsEntity);

    await expect(
      repo.create({
        kind: "section",
        pageId,
        sectionKey: "hero",
        order: 1,
        props: {},
      }),
    ).resolves.toMatchObject({
      kind: "section",
      sectionKey: "hero",
    });

    await expect(
      repo.create({
        kind: "seo",
        pageId,
        title: "Home",
      }),
    ).resolves.toMatchObject({
      kind: "seo",
      title: "Home",
    });
  });

  it("injects the discriminator for variant creates", async () => {
    const sections = entityManager.repo(PageArtifactsEntity.variants.section);

    const section = await sections.create({
      pageId: new ObjectId(),
      sectionKey: "hero",
      order: 1,
      props: {},
    });

    expect(section.kind).toBe("section");
  });

  it("scopes variant findMany by discriminator", async () => {
    const pageId = new ObjectId();
    const pageArtifacts = entityManager.repo(PageArtifactsEntity);
    const sections = entityManager.repo(PageArtifactsEntity.variants.section);

    await pageArtifacts.create({
      kind: "section",
      pageId,
      sectionKey: "hero",
      order: 1,
      props: {},
    });
    await pageArtifacts.create({
      kind: "seo",
      pageId,
      title: "Home",
    });

    const found = await sections.findMany({ pageId });

    expect(found).toHaveLength(1);
    expect(found.every((item) => item.kind === "section")).toBe(true);
  });

  it("scopes variant updateOne by discriminator", async () => {
    const pageId = new ObjectId();
    const pageArtifacts = entityManager.repo(PageArtifactsEntity);
    const sections = entityManager.repo(PageArtifactsEntity.variants.section);

    const section = await pageArtifacts.create({
      kind: "section",
      pageId,
      sectionKey: "hero",
      order: 1,
      props: {},
    });
    const seo = await pageArtifacts.create({
      kind: "seo",
      pageId,
      title: "Home",
    });

    await expect(sections.updateOne({ pageId }, { order: 2 })).resolves.toMatchObject({
      kind: "section",
      order: 2,
    });
    await expect(pageArtifacts.findById(section._id)).resolves.toMatchObject({
      order: 2,
    });
    await expect(pageArtifacts.findById(seo._id)).resolves.toMatchObject({
      kind: "seo",
      title: "Home",
    });
  });

  it("scopes variant deleteOne by discriminator", async () => {
    const pageId = new ObjectId();
    const pageArtifacts = entityManager.repo(PageArtifactsEntity);
    const sections = entityManager.repo(PageArtifactsEntity.variants.section);

    await pageArtifacts.create({
      kind: "section",
      pageId,
      sectionKey: "hero",
      order: 1,
      props: {},
    });
    const seo = await pageArtifacts.create({
      kind: "seo",
      pageId,
      title: "Home",
    });

    await expect(sections.deleteOne({ pageId })).resolves.toBe(true);
    await expect(pageArtifacts.findById(seo._id)).resolves.toMatchObject({
      kind: "seo",
    });
  });

  it("prevents discriminator override during create and update", async () => {
    const sections = entityManager.repo(PageArtifactsEntity.variants.section);

    const section = await sections.create({
      kind: "seo",
      pageId: new ObjectId(),
      sectionKey: "hero",
      order: 1,
      props: {},
    } as any);

    expect(section.kind).toBe("section");

    const updated = await sections.updateById(section._id, {
      kind: "seo",
      order: 2,
    } as any);

    expect(updated?.kind).toBe("section");
    expect(updated?.order).toBe(2);
  });

  it("injects the discriminator for variant active record creates", async () => {
    const Section = entityManager.active(PageArtifactsEntity.variants.section);

    const section = await Section.create({
      pageId: new ObjectId(),
      sectionKey: "hero",
      order: 1,
      props: {},
    });

    expect(section.data.kind).toBe("section");
  });

  it("infers base and variant entity types", () => {
    const pageId = new ObjectId();
    const sectionDocument: EntityType<typeof PageArtifactsEntity.variants.section> = {
      _id: new ObjectId(),
      kind: "section",
      pageId,
      sectionKey: "hero",
      order: 1,
      props: {},
    };
    const seoDocument: EntityType<typeof PageArtifactsEntity.variants.seo> = {
      _id: new ObjectId(),
      kind: "seo",
      pageId,
      title: "Home",
    };
    const baseSection: EntityType<typeof PageArtifactsEntity> = sectionDocument;
    const baseSeo: EntityType<typeof PageArtifactsEntity> = seoDocument;

    expect(baseSection.kind).toBe("section");
    expect(baseSeo.kind).toBe("seo");

    function assertVariantTypes() {
      const sections = entityManager.repo(PageArtifactsEntity.variants.section);

      sections.create({
        pageId,
        sectionKey: "hero",
        order: 1,
        props: {},
      });

      sections.create({
        pageId,
        // @ts-expect-error section variants do not accept seo-only input
        title: "SEO title",
      });

      sections.create({
        // @ts-expect-error variant create input does not accept discriminator overrides
        kind: "seo",
        pageId,
        sectionKey: "hero",
        order: 1,
        props: {},
      });
    }

    void assertVariantTypes;
  });
});
