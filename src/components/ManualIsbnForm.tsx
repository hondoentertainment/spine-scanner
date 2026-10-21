import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { isValidIsbn } from '../utils/isbnValidation.ts';
import { getNearMissCandidates } from '../utils/ocr.ts';
import { useToast } from './Toast.tsx';
import { uiContracts } from '../testing/uiContracts.ts';
import s from './ManualIsbnForm.module.css';

export type ManualIsbnFormHandle = {
  focus: () => void;
  setValue: (value: string) => void;
};

type ManualIsbnFormProps = {
  disabled?: boolean;
  onSubmit: (isbn: string, options: { allowReview?: boolean; source: 'manual' }) => void | Promise<void>;
  onActiveChange?: (active: boolean) => void;
};

function cleanIsbn(value: string): string {
  return value.toUpperCase().replace(/[^0-9X]/g, '');
}

const ManualIsbnForm = forwardRef<ManualIsbnFormHandle, ManualIsbnFormProps>(function ManualIsbnForm(
  { disabled, onSubmit, onActiveChange },
  ref,
) {
  const [value, setValue] = useState('');
  const [nearMisses, setNearMisses] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    setValue: (next: string) => {
      setValue(next);
      setNearMisses([]);
      inputRef.current?.focus();
    },
  }));

  const submitClean = async (digits: string) => {
    let options: { allowReview?: boolean; source: 'manual' } = { source: 'manual' };
    if (!isValidIsbn(digits)) {
      const misses = getNearMissCandidates(digits);
      if (misses.length > 0) {
        setNearMisses(misses);
        toast(`Did you mean ${misses[0]}? Tap to use it.`, 'info');
        return;
      }
      toast('Checksum could not be verified. We will add it for review so you can edit it in your library.', 'warning');
      options = { allowReview: true, source: 'manual' };
    }
    setPending(true);
    try {
      await onSubmit(digits, options);
      setValue('');
      setNearMisses([]);
    } finally {
      setPending(false);
    }
  };

  const onFormSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const digits = cleanIsbn(value);
    if (digits.length !== 10 && digits.length !== 13) {
      toast('Enter a 10 or 13 digit ISBN.', 'warning');
      return;
    }
    submitClean(digits);
  };

  return (
    <form
      onSubmit={onFormSubmit}
      className={s.form}
      data-testid={uiContracts.scannerTypeIsbnTestId}
      aria-label="Type an ISBN"
    >
      <label className={s.label} htmlFor="manual-isbn">ISBN</label>
      <div className={s.row}>
        <input
          id="manual-isbn"
          ref={inputRef}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          pattern="[0-9Xx\-]{10,17}"
          placeholder="Type an ISBN"
          value={value}
          data-testid={uiContracts.scannerManualInputTestId}
          onChange={(event) => {
            setValue(event.target.value);
            setNearMisses([]);
          }}
          onFocus={() => onActiveChange?.(true)}
          onBlur={() => onActiveChange?.(false)}
          aria-label="Enter ISBN manually"
          className={s.input}
          disabled={disabled || pending}
        />
        <button
          type="submit"
          disabled={cleanIsbn(value).length < 10 || disabled || pending}
          aria-label="Submit ISBN"
          data-testid={uiContracts.scannerManualSubmitTestId}
          className={s.submit}
        >
          {disabled || pending ? <Loader2 className="animate-spin" size={18} aria-hidden /> : <Check size={18} aria-hidden />}
          <span>Add</span>
        </button>
      </div>
      {nearMisses.length > 0 && (
        <div className={s.misses} role="group" aria-label="Possible ISBN corrections">
          {nearMisses.map((miss) => (
            <button key={miss} type="button" className={s.miss} onClick={() => submitClean(miss)}>
              Use {miss}
            </button>
          ))}
        </div>
      )}
    </form>
  );
});

export default ManualIsbnForm;
