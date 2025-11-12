import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TvStream } from './tv-stream';

describe('TvStream', () => {
  let component: TvStream;
  let fixture: ComponentFixture<TvStream>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TvStream]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TvStream);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
