import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { Router, ActivatedRoute } from '@angular/router';
import { DataService } from '../../services/data-service';

@Component({
  selector: 'app-series-info',
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatInputModule,
    MatListModule,
    MatIconModule,
    MatGridListModule,
    CommonModule,
  ],
  templateUrl: './series-info.html',
  styleUrl: './series-info.css',
})
export class SeriesInfo {
  router = inject(Router);
  public filteredData: any;
  public allData: any;
  searchTerm = '';
  cols = 8;
  path = '';

  private route = inject(ActivatedRoute);
  id = this.route.snapshot.paramMap.get('id');
  seriesId = this.route.snapshot.paramMap.get('seriesid');

  constructor(private dataService: DataService) {
    this.path = this.router.url.split('/')[1];
  }

  ngOnInit() {
    console.log(this.seriesId);
    this.dataService.getSeriesInfo(this.seriesId).subscribe({
      next: (data: any) => {
        const objs = data.episodes;
        this.filteredData = Object.values(objs).flat();
        this.allData = this.filteredData;
        console.log(data);
      },
    });
  }

  filterCategories() {
    const term = this.searchTerm.toLowerCase();
    this.filteredData = this.allData.filter((cat: { name: string }) =>
      cat.name.toLowerCase().includes(term),
    );
  }

  onCategoryClick(category: any) {
    this.router.navigate([`/shows/${this.id}/info/${this.seriesId}/stream/${category.id}`]);
  }
}
