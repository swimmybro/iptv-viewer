import { Component, inject } from '@angular/core';
import { DataService } from '../../services/data-service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatGridListModule } from '@angular/material/grid-list';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-tv-category',
  standalone: true,
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
  templateUrl: './tv-category.html',
  styleUrl: './tv-category.css',
})
export class TvCategory {
  router = inject(Router);
  public filteredData: any;
  public allData: any;
  searchTerm = '';
  cols = 8;
  path = '';

  private route = inject(ActivatedRoute);
  categoryId = this.route.snapshot.paramMap.get('id');

  constructor(private dataService: DataService) {
    this.path = this.router.url.split('/')[1];
  }

  ngOnInit() {
    if (this.path === 'tv') {
      this.dataService.getTvCategoryData(this.categoryId).subscribe({
        next: (data) => {
          this.filteredData = data;
          this.allData = this.filteredData;
          console.log(data);
        },
      });
    } else {
      this.dataService.getMovieCategoryData(this.categoryId).subscribe({
        next: (data) => {
          this.filteredData = data;
          this.allData = this.filteredData;
        },
      });
    }
  }

  filterCategories() {
    const term = this.searchTerm.toLowerCase();
    this.filteredData = this.allData.filter((cat: { name: string }) =>
      cat.name.toLowerCase().includes(term),
    );
  }

  onCategoryClick(category: any) {
    if (this.path === 'tv') {
      this.router.navigate([`/tv/${this.categoryId}/stream/${category.stream_id}`]);
    } else {
      this.router.navigate([`/movies/${this.categoryId}/stream/${category.stream_id}`]);
    }
  }
}
