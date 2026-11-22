// Campo de código de uso único (convite de primeiro acesso, redefinição de senha). Visual do InputOTP do HeroUI v3
// (casas separadas, traço no meio, cursor piscando na casa ativa) sobre a lib headless `input-otp`, que é a mesma
// que o HeroUI usa por baixo: um <input> só, então colar, autocompletar do SMS/e-mail e leitor de tela funcionam.
import { OTPInput, REGEXP_ONLY_DIGITS, type SlotProps } from 'input-otp';
import { cx } from './ui';

function Casa({ char, isActive, hasFakeCaret, invalid }: SlotProps & { invalid?: boolean }) {
  return (
    <div className={cx(
      'relative grid place-items-center size-12 rounded-ctl border bg-card text-h3 font-semibold num text-ink transition-colors',
      invalid ? 'border-crit' : isActive ? 'border-brand shadow-[0_0_0_3px_var(--brand-soft-line)]' : 'border-line-strong',
    )}>
      {char}
      {hasFakeCaret && <span aria-hidden="true" className="absolute h-5 w-px bg-ink animate-pulse" />}
    </div>
  );
}

export function InputOTP({ value, onChange, onComplete, length = 6, invalid, autoFocus, disabled, 'aria-label': ariaLabel = 'Código' }: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  length?: number;
  invalid?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  const meio = Math.ceil(length / 2);
  return (
    <OTPInput
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      maxLength={length}
      pattern={REGEXP_ONLY_DIGITS}
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus={autoFocus}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      containerClassName="flex items-center justify-center gap-2 has-[:disabled]:opacity-50"
      render={({ slots }) => (
        <>
          <div className="flex gap-2">{slots.slice(0, meio).map((s, i) => <Casa key={i} {...s} invalid={invalid} />)}</div>
          <span aria-hidden="true" className="w-3 h-0.5 rounded-full bg-line-strong" />
          <div className="flex gap-2">{slots.slice(meio).map((s, i) => <Casa key={i} {...s} invalid={invalid} />)}</div>
        </>
      )}
    />
  );
}
