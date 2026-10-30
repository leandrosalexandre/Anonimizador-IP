import type { PasswordStrength } from '../vault/passwordStrength';

export function StrengthMeter({ strength, id }: { strength: PasswordStrength; id: string }) {
  return (
    <div className="strength" id={id} aria-live="polite">
      <div className={`strength-bar level-${strength.level}`} aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={i < strength.level ? 'filled' : ''} />
        ))}
      </div>
      <p className="strength-label">
        Força da senha: <strong>{strength.label}</strong>
      </p>
      {strength.hints.length > 0 && (
        <ul className="hint-list">
          {strength.hints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
