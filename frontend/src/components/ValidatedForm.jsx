import { Children, cloneElement, isValidElement, useId, useState } from "react";
import { TextField, TextArea, PasswordInput, SelectDropdown } from "@idds/react";
import { fieldError } from "../lib/fieldValidation";

// A common adapter around IDDS fields. It never changes values or submits data.
export default function ValidatedForm({ children, onSubmit, rules = {}, busy = false, ...props }) {
  const id = useId();
  const [errors, setErrors] = useState({});
  const fields = [];
  const walk = (nodes, path = "") => Children.map(nodes, (node, index) => {
    if (!isValidElement(node)) return node;
    const key = `${path}-${index}`;
    const p = node.props;
    const native = ["input", "textarea", "select"].includes(node.type);
    const dropdown = node.type === SelectDropdown;
    const idds = [TextField, TextArea, PasswordInput].includes(node.type);
    if ((native && !["hidden", "checkbox", "radio", "file", "submit"].includes(p.type)) || dropdown || idds) {
      const label = typeof p.label === "string" ? p.label : p["aria-label"] || p.name || p.id || "Kolom ini";
      const value = dropdown ? p.selected : p.value;
      const required = Boolean(p.required || label.includes("*"));
      fields.push({ key, value, label, required, disabled: p.disabled, type: p.type, min: p.min, max: p.max, minLength: p.minLength, rule: rules[label.replace(/\s*\*$/, "")] });
      const error = errors[key];
      const errorId = `${id}${key}-error`;
      const clear = () => setErrors(current => current[key] ? { ...current, [key]: "" } : current);
      const changed = dropdown ? "onSelect" : "onChange";
      const updated = cloneElement(node, {
        disabled: busy || p.disabled,
        ...(!dropdown ? { "aria-invalid": Boolean(error), "aria-describedby": [p["aria-describedby"], error ? errorId : ""].filter(Boolean).join(" ") || undefined } : { error: Boolean(error) }),
        ...(idds ? { status: error ? "error" : p.status } : {}),
        [changed]: (...args) => { clear(); p[changed]?.(...args); },
      });
      return <span key={node.key || key} className="kms-validated-field" data-validation-field={`${id}${key}`}>{updated}{error && <span className="kms-field-error" id={errorId} role="alert">{error}</span>}</span>;
    }
    return p.children ? cloneElement(node, {}, walk(p.children, key)) : node;
  });
  const content = walk(children);
  const submit = event => {
    if (busy) { event.preventDefault(); return; }
    const next = Object.fromEntries(fields.map(field => [field.key, fieldError(field)]).filter(([, message]) => message));
    setErrors(next);
    const first = Object.keys(next)[0];
    if (first) {
      event.preventDefault();
      const form = event.currentTarget;
      requestAnimationFrame(() => {
        const wrapper = [...form.querySelectorAll("[data-validation-field]")].find(element => element.dataset.validationField === `${id}${first}`);
        const control = wrapper?.querySelector("input:not([type=hidden]),textarea,select,button,[tabindex]");
        control?.focus({ preventScroll: true });
        wrapper?.scrollIntoView({ block: "center", behavior: "instant" });
        if (control) { control.setAttribute("aria-invalid", "true"); control.setAttribute("aria-describedby", `${id}${first}-error`); }
      });
      return;
    }
    onSubmit?.(event);
  };
  // Keep cancellation controls usable while a measured upload is in progress.
  return <form {...props} aria-busy={busy} noValidate onSubmit={submit}><fieldset className={`kms-form-fields ${props.className || ""}`}>{content}</fieldset></form>;
}
