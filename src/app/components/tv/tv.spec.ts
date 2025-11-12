import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Tv } from './tv';

describe('Tv', () => {
  let component: Tv;
  let fixture: ComponentFixture<Tv>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Tv]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Tv);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
