import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SeriesInfo } from './series-info';

describe('SeriesInfo', () => {
  let component: SeriesInfo;
  let fixture: ComponentFixture<SeriesInfo>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SeriesInfo]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SeriesInfo);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
