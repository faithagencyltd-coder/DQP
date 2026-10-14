import type { ReactElement } from 'react';
import { cloneElement } from 'react';
import { useOrg } from '../lib/session';
import type { Action, Module } from '../lib/types';

/** Rend l'élément inactif (avec l'explication) quand l'utilisateur n'a pas le droit. */
export function Allowed({ module, action, children, hide }: { module: Module; action: Action; children: ReactElement<{ disabled?: boolean; title?: string }>; hide?: boolean }) {
  const { denyReason } = useOrg();
  const reason = denyReason(module, action);
  if (!reason) return children;
  if (hide) return null;
  return cloneElement(children, { disabled: true, title: reason });
}
