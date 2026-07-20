import { db } from "@workspace/db";
import { notifications } from "@workspace/db/schema";
import { logger } from "./logger.js";

export async function notify(opts: {
  orgId: number;
  userId: number;
  type: string;
  title: string;
  body: string;
  link?: string;
}): Promise<void> {
  try {
    await db.insert(notifications).values({
      orgId: opts.orgId,
      userId: opts.userId,
      type: opts.type,
      title: opts.title,
      body: opts.body,
      link: opts.link ?? null,
    });
  } catch (err) {
    logger.error({ err, opts }, "notify: failed to insert notification (non-fatal)");
  }
}
