import { beforeAll, afterAll, describe, expect, test } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db.js";

const app = createApp();

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

async function registerAndLogin(email: string, name: string) {
  const res = await request(app)
    .post("/api/auth/register")
    .send({ email, password: "password123", name });
  expect(res.status).toBe(201);
  return { token: res.body.token as string, user: res.body.user as { id: string } };
}

describe("AdvChecklists API", () => {
  let owner: { token: string; user: { id: string } };
  let filler: { token: string; user: { id: string } };
  let outsider: { token: string; user: { id: string } };
  let templateId: string;
  let checkboxFieldId: string;
  let buttonFieldId: string;
  let instanceId: string;

  beforeAll(async () => {
    owner = await registerAndLogin("owner@example.com", "Owner Olive");
    filler = await registerAndLogin("filler@example.com", "Filler Fred");
    outsider = await registerAndLogin("outsider@example.com", "Outsider Owen");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("rejects duplicate registration", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: "owner@example.com", password: "password123", name: "Dup" });
    expect(res.status).toBe(409);
  });

  test("logs in with correct credentials and rejects wrong password", async () => {
    const good = await request(app)
      .post("/api/auth/login")
      .send({ email: "owner@example.com", password: "password123" });
    expect(good.status).toBe(200);

    const bad = await request(app)
      .post("/api/auth/login")
      .send({ email: "owner@example.com", password: "wrong" });
    expect(bad.status).toBe(401);
  });

  test("creates a template with an uploaded document and fields", async () => {
    const fields = [
      {
        type: "CHECKBOX",
        label: "Safety check complete",
        x: 10,
        y: 10,
        width: 20,
        height: 5,
        order: 0,
        config: {
          checkedActions: [
            {
              type: "send_email",
              to: "supervisor@example.com",
              subject: "Checklist item done: {{fieldLabel}}",
              body: "{{instanceTitle}} was checked off on {{today}}.",
            },
          ],
        },
      },
      {
        type: "DATE",
        label: "Date reviewed",
        x: 10,
        y: 20,
        width: 20,
        height: 5,
        order: 1,
        config: { autoFillToday: true },
      },
      {
        type: "BUTTON",
        label: "Mark complete",
        x: 10,
        y: 30,
        width: 20,
        height: 5,
        order: 2,
        config: { actions: [{ type: "mark_complete" }] },
      },
    ];

    const res = await request(app)
      .post("/api/templates")
      .set("Authorization", `Bearer ${owner.token}`)
      .field("title", "Site Safety Checklist")
      .field("description", "Weekly inspection")
      .field("fields", JSON.stringify(fields))
      .attach("document", TINY_PNG, { filename: "checklist.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    expect(res.body.currentVersion.fields).toHaveLength(3);
    templateId = res.body.id;
    checkboxFieldId = res.body.currentVersion.fields.find((f: { type: string }) => f.type === "CHECKBOX").id;
    buttonFieldId = res.body.currentVersion.fields.find((f: { type: string }) => f.type === "BUTTON").id;
  });

  test("owner sees the template in their list; outsider does not", async () => {
    const ownerList = await request(app).get("/api/templates").set("Authorization", `Bearer ${owner.token}`);
    expect(ownerList.body.templates.map((t: { id: string }) => t.id)).toContain(templateId);

    const outsiderList = await request(app).get("/api/templates").set("Authorization", `Bearer ${outsider.token}`);
    expect(outsiderList.body.templates.map((t: { id: string }) => t.id)).not.toContain(templateId);
  });

  test("outsider cannot fetch template detail or create an instance", async () => {
    const getRes = await request(app)
      .get(`/api/templates/${templateId}`)
      .set("Authorization", `Bearer ${outsider.token}`);
    expect(getRes.status).toBe(403);

    const createRes = await request(app)
      .post("/api/instances")
      .set("Authorization", `Bearer ${outsider.token}`)
      .send({ templateId, title: "Attempt" });
    expect(createRes.status).toBe(403);
  });

  test("owner adds a collaborator by email", async () => {
    const res = await request(app)
      .post(`/api/templates/${templateId}/collaborators`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ email: "filler@example.com", role: "FILLER" });
    expect(res.status).toBe(201);
    expect(res.body.role).toBe("FILLER");
  });

  test("a FILLER collaborator cannot edit fields (needs EDITOR+)", async () => {
    const res = await request(app)
      .put(`/api/templates/${templateId}/fields`)
      .set("Authorization", `Bearer ${filler.token}`)
      .field("fields", JSON.stringify({ fields: [] }));
    expect(res.status).toBe(403);
  });

  test("collaborator creates an instance and DATE field auto-fills today", async () => {
    const res = await request(app)
      .post("/api/instances")
      .set("Authorization", `Bearer ${filler.token}`)
      .send({ templateId, title: "Week 32 inspection" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("IN_PROGRESS");
    instanceId = res.body.id;

    const detail = await request(app)
      .get(`/api/instances/${instanceId}`)
      .set("Authorization", `Bearer ${filler.token}`);
    const dateField = detail.body.fields.find((f: { type: string }) => f.type === "DATE");
    expect(detail.body.values[dateField.id].value).toBe(new Date().toISOString().slice(0, 10));
  });

  test("checking the checkbox triggers the send_email action and is logged in history", async () => {
    const res = await request(app)
      .patch(`/api/instances/${instanceId}/fields/${checkboxFieldId}`)
      .set("Authorization", `Bearer ${filler.token}`)
      .send({ value: true });
    expect(res.status).toBe(200);
    expect(res.body.actionsTriggered).toContain("send_email");

    const history = await request(app)
      .get(`/api/instances/${instanceId}/history`)
      .set("Authorization", `Bearer ${filler.token}`);
    expect(history.body.history).toHaveLength(1);
    expect(history.body.history[0].actionType).toBe("send_email");
    expect(history.body.history[0].status).toBe("SUCCESS");
  });

  test("pressing the button triggers mark_complete and updates instance status", async () => {
    const res = await request(app)
      .patch(`/api/instances/${instanceId}/fields/${buttonFieldId}`)
      .set("Authorization", `Bearer ${filler.token}`)
      .send({ value: true });
    expect(res.status).toBe(200);
    expect(res.body.instanceStatus).toBe("COMPLETED");

    const history = await request(app)
      .get(`/api/instances/${instanceId}/history`)
      .set("Authorization", `Bearer ${filler.token}`);
    expect(history.body.history).toHaveLength(2);
    expect(history.body.history[1].actionType).toBe("mark_complete");
  });

  test("owner publishes a new version, creating template history", async () => {
    const res = await request(app)
      .put(`/api/templates/${templateId}/fields`)
      .set("Authorization", `Bearer ${owner.token}`)
      .field(
        "fields",
        JSON.stringify({
          fields: [
            { type: "TEXT", label: "Notes", x: 5, y: 5, width: 30, height: 10, order: 0, config: {} },
          ],
        })
      );
    expect(res.status).toBe(201);
    expect(res.body.currentVersion.versionNumber).toBe(2);

    const versions = await request(app)
      .get(`/api/templates/${templateId}/versions`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(versions.body.versions).toHaveLength(2);
  });

  test("template instance history lists the completed instance", async () => {
    const res = await request(app)
      .get(`/api/templates/${templateId}/instances`)
      .set("Authorization", `Bearer ${owner.token}`);
    expect(res.status).toBe(200);
    expect(res.body.instances).toHaveLength(1);
    expect(res.body.instances[0].status).toBe("COMPLETED");
  });
});
