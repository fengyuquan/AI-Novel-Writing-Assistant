import { Prisma } from "@prisma/client";
import { resolveDatabaseRuntimeConfig } from "../../../config/database";
import {
  PINNED_MODELS,
  isAutoManagedField,
  isModelAllowed,
  isReadOnlyModel,
  isSensitiveField,
} from "../domain/adminPolicy";

export type AdminFieldKind = "scalar" | "enum" | "object";

export interface AdminFieldMeta {
  name: string;
  kind: AdminFieldKind;
  type: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isList: boolean;
  isRelation: boolean;
  relationTo: string | null;
  isSensitive: boolean;
  isWritable: boolean;
  isJsonLike: boolean;
}

export interface AdminModelMeta {
  name: string;
  clientKey: string;
  primaryKey: string;
  fields: AdminFieldMeta[];
  pinned: boolean;
  readOnlyDefault: boolean;
}

export interface AdminMetaPayload {
  databaseProvider: string;
  modelCount: number;
  pinnedModels: string[];
  models: AdminModelMeta[];
  backupHint: string;
}

type DmmfField = {
  name: string;
  kind: string;
  type: string;
  relationName?: string;
  isList?: boolean;
};

type DmmfModel = {
  name: string;
  fields: DmmfField[];
};

function isJsonLikeField(field: DmmfField): boolean {
  if (field.type === "Json") {
    return true;
  }
  return field.kind === "scalar" && /Json$/i.test(field.name);
}

function resolvePrimaryKey(fields: DmmfField[]): string {
  const idField = fields.find((field) => field.kind === "scalar" && field.name === "id");
  if (idField) {
    return idField.name;
  }
  const firstScalar = fields.find((field) => field.kind === "scalar" || field.kind === "enum");
  if (!firstScalar) {
    throw new Error("Model has no scalar primary key candidate.");
  }
  return firstScalar.name;
}

function buildFieldMeta(modelName: string, field: DmmfField, primaryKey: string, allFields: DmmfField[]): AdminFieldMeta {
  const isRelation = field.kind === "object";
  const relationTo = isRelation ? field.type : null;
  const matchingRelation = !isRelation && field.name.endsWith("Id")
    ? allFields.find(
        (candidate) =>
          candidate.kind === "object" &&
          candidate.name === field.name.slice(0, -2),
      )
    : undefined;
  const isForeignKey = Boolean(matchingRelation);
  const isSensitive = isSensitiveField(modelName, field.name);
  const isWritable =
    !isRelation &&
    !isAutoManagedField(field.name) &&
    field.name !== primaryKey;

  return {
    name: field.name,
    kind: (field.kind === "enum" || field.kind === "object" || field.kind === "scalar"
      ? field.kind
      : "scalar") as AdminFieldKind,
    type: field.type,
    isPrimaryKey: field.name === primaryKey,
    isForeignKey,
    isList: Boolean(field.isList),
    isRelation,
    relationTo: isForeignKey ? matchingRelation?.type ?? null : relationTo,
    isSensitive,
    isWritable,
    isJsonLike: isJsonLikeField(field),
  };
}

export function listAdminModels(): AdminModelMeta[] {
  const models = Prisma.dmmf.datamodel.models as unknown as DmmfModel[];
  return models
    .filter((model) => isModelAllowed(model.name))
    .map((model) => {
      const primaryKey = resolvePrimaryKey(model.fields);
      const fields = model.fields.map((field) => buildFieldMeta(model.name, field, primaryKey, model.fields));
      return {
        name: model.name,
        clientKey: model.name.charAt(0).toLowerCase() + model.name.slice(1),
        primaryKey,
        fields,
        pinned: (PINNED_MODELS as readonly string[]).includes(model.name),
        readOnlyDefault: isReadOnlyModel(model.name),
      };
    })
    .sort((left, right) => {
      if (left.pinned !== right.pinned) {
        return left.pinned ? -1 : 1;
      }
      const leftPin = (PINNED_MODELS as readonly string[]).indexOf(left.name);
      const rightPin = (PINNED_MODELS as readonly string[]).indexOf(right.name);
      if (left.pinned && right.pinned && leftPin !== rightPin) {
        return leftPin - rightPin;
      }
      return left.name.localeCompare(right.name);
    });
}

export function getAdminModelMeta(modelName: string): AdminModelMeta {
  const model = listAdminModels().find((item) => item.name === modelName);
  if (!model) {
    throw new Error(`Unknown or disallowed model: ${modelName}`);
  }
  return model;
}

export function getAdminMetaPayload(): AdminMetaPayload {
  const models = listAdminModels();
  const runtime = resolveDatabaseRuntimeConfig({ allowDefault: true });
  return {
    databaseProvider: runtime.provider,
    modelCount: models.length,
    pinnedModels: [...PINNED_MODELS],
    models,
    backupHint:
      runtime.provider === "sqlite"
        ? "改数或删除前请先停写并备份 SQLite 文件（通常为 server/dev.db）。可用 pnpm db:restore 相关流程恢复。"
        : "改数或删除前请先对当前 Postgres 做快照/逻辑备份。本控制台不提供 migrate reset。",
  };
}
