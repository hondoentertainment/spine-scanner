import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ManualIsbnForm, { type ManualIsbnFormHandle } from '../ManualIsbnForm';
import { ToastProvider } from '../Toast';
import { uiContracts } from '../../testing/uiContracts';

function renderForm(onSubmit = vi.fn()) {
  const ref = createRef<ManualIsbnFormHandle>();
  render(
    <ToastProvider>
      <ManualIsbnForm ref={ref} onSubmit={onSubmit} />
    </ToastProvider>,
  );
  return { onSubmit, ref };
}

describe('ManualIsbnForm', () => {
  it('shows the ISBN field immediately', () => {
    renderForm();
    expect(screen.getByTestId(uiContracts.scannerManualInputTestId)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Submit ISBN' })).toBeDisabled();
  });

  it('submits a valid ISBN', () => {
    const { onSubmit } = renderForm();
    fireEvent.change(screen.getByLabelText('Enter ISBN manually'), { target: { value: '9780141036144' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit ISBN' }));
    expect(onSubmit).toHaveBeenCalledWith('9780141036144', { source: 'manual' });
  });

  it('focuses from the imperative handle', async () => {
    const { ref } = renderForm();
    const input = screen.getByLabelText('Enter ISBN manually');
    await act(async () => {
      ref.current?.setValue('9780141036144');
    });
    expect(input).toHaveValue('9780141036144');
    expect(input).toHaveFocus();
  });

  it('keeps a short ISBN from submitting', () => {
    const { onSubmit } = renderForm();
    fireEvent.change(screen.getByLabelText('Enter ISBN manually'), { target: { value: '123456' } });
    expect(screen.getByRole('button', { name: 'Submit ISBN' })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a valid ISBN-10', () => {
    const { onSubmit } = renderForm();
    fireEvent.change(screen.getByLabelText('Enter ISBN manually'), { target: { value: '0743273567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit ISBN' }));
    expect(onSubmit).toHaveBeenCalledWith('0743273567', { source: 'manual' });
  });

  it('sends an unverifiable ISBN for review', () => {
    const { onSubmit } = renderForm();
    fireEvent.change(screen.getByLabelText('Enter ISBN manually'), { target: { value: '1111111111111' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit ISBN' }));
    expect(onSubmit).toHaveBeenCalledWith('1111111111111', { allowReview: true, source: 'manual' });
  });

  it('disables submit while the add is in flight', async () => {
    let resolveScan: (() => void) | undefined;
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => {
      resolveScan = resolve;
    }));
    render(
      <ToastProvider>
        <ManualIsbnForm onSubmit={onSubmit} />
      </ToastProvider>,
    );
    fireEvent.change(screen.getByLabelText('Enter ISBN manually'), { target: { value: '9780141036144' } });
    const submit = screen.getByRole('button', { name: 'Submit ISBN' });
    fireEvent.click(submit);
    await waitFor(() => expect(submit).toBeDisabled());
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveScan?.();
    });
  });

  it('disables the field while a lookup is in flight', () => {
    render(
      <ToastProvider>
        <ManualIsbnForm onSubmit={vi.fn()} disabled />
      </ToastProvider>,
    );
    expect(screen.getByLabelText('Enter ISBN manually')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Submit ISBN' })).toBeDisabled();
  });
});
