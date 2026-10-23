import React from "react";
import { CustomSelect, CustomSelectOption } from "./CustomSelect";

export type SelectOption = CustomSelectOption;

interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
}

export function Select({
  options,
  value,
  onChange,
  className,
  label,
  placeholder,
  disabled,
  required,
}: SelectProps) {
  return (
    <CustomSelect
      options={options}
      value={value}
      onChange={onChange}
      className={className}
      label={label}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
    />
  );
}
