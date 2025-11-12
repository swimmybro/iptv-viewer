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
    MatGridListModule
  ],
  templateUrl: './tv-category.html',
  styleUrl: './tv-category.css',
})
export class TvCategory {

  router = inject(Router);
  public filteredData: any;
  searchTerm = '';
  cols = 4;

  private route = inject(ActivatedRoute);
  categoryId = this.route.snapshot.paramMap.get('id');

  constructor(private dataService: DataService) { }

  ngOnInit() {
    this.dataService.getTvCategoryData(this.categoryId).subscribe({
      next: (data) => {
        this.filteredData = data;
        console.log(data);
      }
    });
  }

  filterCategories() {
    const term = this.searchTerm.toLowerCase();
    this.filteredData = this.filteredData.filter((cat: { category_name: string; }) =>
      cat.category_name.toLowerCase().includes(term)
    );
  }

  onCategoryClick(category: any) {
    this.router.navigate([`/tv/${this.categoryId}/stream/${category.stream_id}`]);
  }

}
