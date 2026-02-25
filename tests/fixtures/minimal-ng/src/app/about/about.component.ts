import { Component } from '@angular/core';

@Component({
  selector: 'app-about',
  template: `
    <h1>About</h1>
    <a routerLink="/home">Back to Home</a>
    <a href="https://angular.io/docs">Angular Docs</a>
  `,
})
export class AboutComponent {}
