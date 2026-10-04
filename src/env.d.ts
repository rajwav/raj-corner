/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    session?: import('./lib/access-control/types').UserSession | null;
    user?: import('./lib/access-control/types').UserSession | null;
  }
}
