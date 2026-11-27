"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, SelectInput, SearchableSelect, Textarea } from "@devdigest/ui";
import type { Provider } from "@devdigest/shared";
import { useCreateAgent, useProviderModels } from "../../../../../../lib/hooks/agents";
import { toModelOptions, withCurrentModel } from "../../../../../../lib/model-label";
import { DEFAULT_MODELS, DEFAULT_PROVIDER, MODAL_WIDTH, PROVIDER_OPTIONS } from "./constants";
import { s } from "./styles";

/**
 * Create-agent modal — name/description/provider/model/system-prompt. The model
 * picker lists the chosen provider's live models; switching the provider resets
 * the model to that provider's default (or to none, so the user picks one).
 * @param props.onClose - closes the modal (cancel, backdrop, or after creating)
 * @returns the modal
 */
export function CreateAgentModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const create = useCreateAgent();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [provider, setProvider] = React.useState<Provider>(DEFAULT_PROVIDER);
  const [model, setModel] = React.useState(DEFAULT_MODELS[DEFAULT_PROVIDER] ?? "");
  const [systemPrompt, setSystemPrompt] = React.useState(t("create.defaultSystemPrompt"));

  const { data: models } = useProviderModels(provider);
  const modelOptions = withCurrentModel(toModelOptions(models), model);
  // Empty list after load = the provider's API key is missing or invalid.
  const noModels = models !== undefined && models.length === 0;

  const changeProvider = (next: Provider) => {
    setProvider(next);
    setModel(DEFAULT_MODELS[next] ?? "");
  };

  const submit = async () => {
    const agent = await create.mutateAsync({
      name: name.trim() || t("create.defaultName"),
      description,
      provider,
      model,
      system_prompt: systemPrompt,
    });
    onClose();
    router.push(`/agents/${agent.id}?tab=config`);
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("create.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={create.isPending || !model}>
            {create.isPending ? t("create.creating") : t("create.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <FormField label={t("create.fields.name")} required>
          <TextInput value={name} onChange={setName} placeholder={t("create.fields.namePlaceholder")} />
        </FormField>
        <FormField label={t("create.fields.description")}>
          <TextInput
            value={description}
            onChange={setDescription}
            placeholder={t("create.fields.descriptionPlaceholder")}
          />
        </FormField>
        <FormField label={t("create.fields.provider")}>
          <SelectInput
            value={provider}
            onChange={(v) => changeProvider(v as Provider)}
            options={[...PROVIDER_OPTIONS]}
          />
        </FormField>
        <FormField
          label={t("create.fields.model")}
          required
          hint={noModels ? t("config.modelEmptyHint", { provider }) : t("config.modelHint")}
        >
          <SearchableSelect
            value={model}
            onChange={setModel}
            options={modelOptions}
            placeholder={t("config.modelSearch")}
            ariaLabel={t("create.fields.model")}
          />
        </FormField>
        <FormField label={t("create.fields.systemPrompt")}>
          <Textarea value={systemPrompt} onChange={setSystemPrompt} rows={6} mono />
        </FormField>
      </div>
    </Modal>
  );
}
